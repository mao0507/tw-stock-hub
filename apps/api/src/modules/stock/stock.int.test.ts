// #4 股票搜尋與個股總覽
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Quote = { date: string; open: number; high: number; low: number; close: number; volume: number; changePct: number | null }

async function quote(date: string, stockId: string, o: number, h: number, l: number, c: number, v: number) {
  await t.admin`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct, transaction_count)
    VALUES (${date}, ${stockId}, ${o}, ${h}, ${l}, ${c}, ${v}, ${v * c}, 5, 0.5, 100)`
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await t.admin`
    INSERT INTO stocks.stocks (id, name, market, sector, is_active) VALUES
      ('2330', '台積電', 'TWSE', '半導體', TRUE),
      ('7101', '測試甲', 'TWSE', '測試', TRUE),
      ('7110', '測試乙', 'TWSE', '測試', TRUE),
      ('7120', '測試櫃', 'TPEX', '測試', TRUE),
      ('7199', '測試下市', 'TWSE', NULL, FALSE),
      ('9998', '已下市', 'TWSE', NULL, FALSE)
    ON CONFLICT (id) DO NOTHING`
  // 2026-09-14（一）～ 09-25（五）兩週
  const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
  for (const [i, d] of days.entries()) await quote(d, '2330', 100 + i, 110 + i, 90 + i, 105 + i, 1000)
  await quote('2026-08-31', '2330', 90, 95, 85, 92, 500)
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

const get = async <T>(path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as T }
}

describe('GET /api/stocks/search', () => {
  it('代號前綴優先，其次名稱包含；排除下市', async () => {
    const { body } = await get<{ id: string }[]>('/stocks/search?q=71')
    expect(body.map((s) => s.id)).toEqual(['7101', '7110', '7120'])
    const byName = await get<{ id: string }[]>(`/stocks/search?q=${encodeURIComponent('測試')}`)
    expect(byName.body.map((s) => s.id)).toEqual(['7101', '7110', '7120'])
  })

  it('名稱搜尋並回傳市場與產業', async () => {
    const { body } = await get<unknown[]>(`/stocks/search?q=${encodeURIComponent('台積')}`)
    expect(body).toEqual([{ id: '2330', name: '台積電', market: 'TWSE', sector: '半導體' }])
  })

  it('代號前綴排在只有中間包含的前面', async () => {
    const { body } = await get<{ id: string }[]>('/stocks/search?q=710')
    expect(body.map((s) => s.id)).toEqual(['7101'])
    // 代號中間包含不算（只比對前綴）
    const r = await get<{ id: string }[]>('/stocks/search?q=12')
    expect(r.body.map((s) => s.id)).not.toContain('7120')
  })

  it('市場篩選與筆數上限', async () => {
    expect((await get<{ id: string }[]>('/stocks/search?q=71&market=TPEX')).body.map((s) => s.id)).toEqual(['7120'])
    expect((await get<{ id: string }[]>('/stocks/search?q=71&market=TWSE')).body.map((s) => s.id)).toEqual(['7101', '7110'])
    expect((await get<unknown[]>('/stocks/search?q=2&limit=1')).body).toHaveLength(1)
  })

  it('缺少 q 或 limit 超出範圍回 400', async () => {
    expect((await get('/stocks/search')).status).toBe(400)
    expect((await get('/stocks/search?q=2&limit=99')).status).toBe(400)
  })

  it('LIKE 萬用字元被當成一般字元', async () => {
    expect((await get<unknown[]>('/stocks/search?q=%25')).body).toEqual([])
  })
})

describe('GET /api/stocks/:id', () => {
  it('回傳基本資料與最新報價（含前一日收盤）', async () => {
    const { status, body } = await get<Record<string, unknown>>('/stocks/2330')
    expect(status).toBe(200)
    expect(body).toMatchObject({
      id: '2330',
      name: '台積電',
      market: 'TWSE',
      sector: '半導體',
      isActive: true,
      latestQuote: {
        date: '2026-09-25',
        open: 109,
        high: 119,
        low: 99,
        close: 114,
        volume: 1000,
        value: 114000,
        change: 5,
        changePct: 0.5,
        transactionCount: 100,
        prevClose: 109,
      },
    })
  })

  it('沒有行情時 latestQuote 為 null', async () => {
    expect((await get<{ latestQuote: unknown }>('/stocks/7101')).body.latestQuote).toBeNull()
  })

  it('查無或已下市回 404', async () => {
    expect((await get('/stocks/0000')).status).toBe(404)
    expect((await get('/stocks/9998')).status).toBe(404)
  })
})

describe('GET /api/stocks/:id/quote', () => {
  it('日 K：由舊到新，預設 60 筆，可限制筆數', async () => {
    const all = (await get<Quote[]>('/stocks/2330/quote')).body
    expect(all).toHaveLength(11)
    expect(all[0]!.date).toBe('2026-08-31')
    expect(all.at(-1)).toEqual({ date: '2026-09-25', open: 109, high: 119, low: 99, close: 114, volume: 1000, changePct: 0.5 })

    const last3 = (await get<Quote[]>('/stocks/2330/quote?limit=3')).body
    expect(last3.map((q) => q.date)).toEqual(['2026-09-23', '2026-09-24', '2026-09-25'])
  })

  it('from / to 篩選', async () => {
    const r = (await get<Quote[]>('/stocks/2330/quote?from=2026-09-15&to=2026-09-16')).body
    expect(r.map((q) => q.date)).toEqual(['2026-09-15', '2026-09-16'])
  })

  it('週 K：以週一為起點彙總 OHLCV', async () => {
    const r = (await get<Quote[]>('/stocks/2330/quote?interval=weekly&from=2026-09-14')).body
    expect(r).toEqual([
      { date: '2026-09-18', open: 100, high: 114, low: 90, close: 109, volume: 5000, changePct: null },
      { date: '2026-09-25', open: 105, high: 119, low: 95, close: 114, volume: 5000, changePct: null },
    ])
  })

  it('月 K：依月份彙總', async () => {
    const r = (await get<Quote[]>('/stocks/2330/quote?interval=monthly')).body
    expect(r.map((q) => [q.date, q.open, q.close, q.volume])).toEqual([
      ['2026-08-31', 90, 92, 500],
      ['2026-09-25', 100, 114, 10000],
    ])
  })

  it('週 K 起點落在週中時往前補齊整週，第一根不會是半週', async () => {
    const r = (await get<Quote[]>('/stocks/2330/quote?interval=weekly&from=2026-09-16')).body
    expect(r[0]).toEqual({ date: '2026-09-18', open: 100, high: 114, low: 90, close: 109, volume: 5000, changePct: null })
  })

  it('月 K 被 limit 切在月中時往前補齊整月', async () => {
    const r = (await get<Quote[]>('/stocks/2330/quote?interval=monthly&limit=3')).body
    expect(r.map((q) => [q.date, q.open, q.close, q.volume])).toEqual([['2026-09-25', 100, 114, 10000]])
  })

  it('查無股票回 404；參數錯誤回 400', async () => {
    expect((await get('/stocks/0000/quote')).status).toBe(404)
    expect((await get('/stocks/2330/quote?interval=yearly')).status).toBe(400)
    expect((await get('/stocks/2330/quote?limit=501')).status).toBe(400)
    expect((await get('/stocks/abc/quote')).status).toBe(400)
  })
})
