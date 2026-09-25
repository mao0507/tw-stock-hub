// #7 首頁與大盤：總覽、歷史、類股熱力圖、類股成分股
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { responseCache } from '../../lib/cache.js'
import { startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

const get = async <T>(path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as T }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('無資料時', () => {
  it('總覽 404、熱力圖與歷史為空', async () => {
    expect((await get('/market/overview')).status).toBe(404)
    expect((await get('/market/heatmap')).body).toEqual({ date: null, sectors: [] })
    expect((await get('/market/history')).body).toEqual([])
    expect((await get('/market/sector-stocks?sector=x')).body).toEqual({ sector: 'x', date: null, stocks: [] })
  })
})

describe('有資料時', () => {
  beforeAll(async () => {
    const a = t.admin
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
    for (const [i, d] of days.entries()) {
      await a`
        INSERT INTO stocks.market_index
          (date, taiex_close, taiex_change, taiex_change_pct, total_volume, total_value,
           up_count, down_count, flat_count, limit_up_count, limit_down_count,
           taiex_open, taiex_high, taiex_low, taiex_prev_close)
        VALUES (${d}, ${100 + i}, ${i === 0 ? 2 : 1}, 1, 10, 1000, 900, 800, 100, 5, 2,
                ${99 + i}, ${101 + i}, ${98 + i}, ${99 + i})`
    }
    await a`
      INSERT INTO stocks.stocks (id, name, market, sector, is_active) VALUES
        ('7301', '類股甲', 'TWSE', '半導體類指數', TRUE),
        ('7302', '類股乙', 'TWSE', '半導體類指數', TRUE),
        ('7303', '類股丙', 'TWSE', '半導體類指數', TRUE),
        ('7304', '下市', 'TWSE', '半導體類指數', FALSE),
        ('7305', '上櫃股', 'TPEX', '櫃買電子類指數', TRUE),
        ('0077', '某ETF', 'TWSE', NULL, TRUE)`
    const quote = (id: string, change: number, pct: number) => a`
      INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct)
      VALUES ('2026-09-25', ${id}, 50, 50, 50, 50, 1, 5000, ${change}, ${pct})`
    await quote('7301', 1, 2)
    await quote('7302', -1, -2)
    await quote('7304', 0, 0)
    await quote('0077', 1, 1) // ETF：不計入漲跌家數
    // 上櫃股晚一天才有行情：不影響大盤家數，也不影響上市類股的行情日
    await a`
      INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct)
      VALUES ('2026-09-25', '7305', 1, 1, 1, 1, 1, 1, 1, 1), ('2026-09-26', '7305', 1, 1, 1, 1, 1, 1, 1, 1)`
    // 7303 當天無行情
    await a`
      INSERT INTO stocks.sector_performance (date, sector_name, index_value, change, change_pct, volume, value) VALUES
        ('2026-09-24', '半導體類指數', 100, 1, 1, 1, 1),
        ('2026-09-25', '半導體類指數', 100, 1, 1.5, 10, 100),
        ('2026-09-25', '金融保險類指數', 100, 1, -0.5, 20, 200),
        ('2026-09-25', '發行量加權股價指數', 100, 1, 0.8, 30, 300)`
    // 模擬爬蟲完成通知清空快取（上一組測試快取了「無資料」的結果）
    responseCache.clear()
  })

  it('總覽：最新一日指數，漲跌家數只計上市個股（排除上櫃、ETF）', async () => {
    expect((await get('/market/overview')).body).toEqual({
      date: '2026-09-25',
      taiexClose: 109,
      taiexChange: 1,
      taiexChangePct: 1,
      totalValue: 1000,
      totalVolume: 10,
      upCount: 1,
      downCount: 1,
      flatCount: 1,
      limitUpCount: 5,
      limitDownCount: 2,
      taiexOpen: 108,
      taiexHigh: 110,
      taiexLow: 107,
      taiexPrevClose: 108,
    })
  })

  it('歷史日線：由舊到新，limit 控制筆數', async () => {
    expect((await get('/market/history?limit=2')).body).toEqual([
      { date: '2026-09-24', close: 108, change: 1, changePct: 1, totalValue: 1000 },
      { date: '2026-09-25', close: 109, change: 1, changePct: 1, totalValue: 1000 },
    ])
  })

  it('週線：收盤取週末，漲跌對前一週收盤', async () => {
    expect((await get('/market/history?interval=weekly&from=2026-09-14')).body).toEqual([
      // 前一週收盤 = 09-14 收盤 − 當日漲跌 = 98
      { date: '2026-09-18', close: 104, change: 6, changePct: 6.12, totalValue: 5000 },
      { date: '2026-09-25', close: 109, change: 5, changePct: 4.81, totalValue: 5000 },
    ])
  })

  it('週/月線的 limit 是 K 棒根數（先彙總再取最後 N 根）', async () => {
    expect((await get('/market/history?interval=weekly&limit=1')).body).toEqual([
      { date: '2026-09-25', close: 109, change: 5, changePct: 4.81, totalValue: 5000 },
    ])
    expect((await get('/market/history?interval=monthly&limit=3')).body).toEqual([
      { date: '2026-09-25', close: 109, change: 11, changePct: 11.22, totalValue: 10000 },
    ])
  })

  it('from 落在週中時不會帶入 from 之前的資料', async () => {
    const [first] = (await get<{ date: string; change: number; totalValue: number }[]>(
      '/market/history?interval=weekly&from=2026-09-16',
    )).body
    // 只含 09-16～09-18 三天；漲跌對 09-15 收盤（101）
    expect(first).toEqual({ date: '2026-09-18', close: 104, change: 3, changePct: 2.97, totalValue: 3000 })
  })

  it('參數錯誤回 400', async () => {
    expect((await get('/market/history?limit=366')).status).toBe(400)
    expect((await get('/market/history?interval=yearly')).status).toBe(400)
    expect((await get('/market/sector-stocks')).status).toBe(400)
  })

  it('熱力圖：最新一日的類指數，依漲跌幅排序（排除大盤指數）', async () => {
    expect((await get('/market/heatmap')).body).toEqual({
      date: '2026-09-25',
      sectors: [
        { sectorName: '半導體類指數', changePct: 1.5, value: 100, volume: 10 },
        { sectorName: '金融保險類指數', changePct: -0.5, value: 200, volume: 20 },
      ],
    })
  })

  it('類股成分股：最新交易日行情，依漲跌幅排序，無行情排最後，排除下市', async () => {
    expect((await get(`/market/sector-stocks?sector=${encodeURIComponent('半導體類指數')}`)).body).toEqual({
      sector: '半導體類指數',
      date: '2026-09-25',
      stocks: [
        { stockId: '7301', stockName: '類股甲', close: 50, changePct: 2, value: 5000 },
        { stockId: '7302', stockName: '類股乙', close: 50, changePct: -2, value: 5000 },
        { stockId: '7303', stockName: '類股丙', close: null, changePct: null, value: null },
      ],
    })
  })
})
