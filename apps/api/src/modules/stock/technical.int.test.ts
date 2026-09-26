// #19 技術指標
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedQuotes, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

const get = async <T>(path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as T }
}

type Indicators = {
  latest: {
    date: string
    close: number
    ma5: number | null
    ma20: number | null
    ma60: number | null
    rsi14: number | null
    bullishAlignment: boolean
    aboveMa20: boolean | null
    aboveMa60: boolean | null
    rsScore: number | null
  } | null
  series: { date: string; ma5: number | null; k9: number | null; volMa5: number | null; rsScore: number | null }[]
}

async function indicator(stockId: string, date: string, v: Record<string, number | null>) {
  await t.admin`
    INSERT INTO stocks.technical_indicators
      (date, stock_id, ma5, ma10, ma20, ma60, ma120, ma240, rsi14, k9, d9, dif, dea, macd_hist, vol_ma5, vol_ma20)
    VALUES (${date}, ${stockId}, ${v.ma5 ?? null}, ${v.ma10 ?? null}, ${v.ma20 ?? null}, ${v.ma60 ?? null},
            ${v.ma120 ?? null}, ${v.ma240 ?? null}, ${v.rsi14 ?? null}, ${v.k9 ?? null}, ${v.d9 ?? null},
            ${v.dif ?? null}, ${v.dea ?? null}, ${v.macd_hist ?? null}, ${v.vol_ma5 ?? null}, ${v.vol_ma20 ?? null})`
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '7301', '多頭股')
  await seedStock(t.admin, '7302', '空頭股')
  await seedStock(t.admin, '7303', '沒指標')
  await seedQuotes(t.admin, [
    { stockId: '7301', date: '2026-09-23', close: 108 },
    { stockId: '7301', date: '2026-09-24', close: 110 },
    { stockId: '7302', date: '2026-09-24', close: 50 },
  ])
  await indicator('7301', '2026-09-23', { ma5: 105, ma10: 102, ma20: 100, ma60: 95, k9: 70, vol_ma5: 1000 })
  await indicator('7301', '2026-09-24', { ma5: 106, ma10: 103, ma20: 101, ma60: 96, rsi14: 65.5, k9: 72, vol_ma5: 1100 })
  await indicator('7302', '2026-09-24', { ma5: 51, ma10: 53, ma20: 55, ma60: null })
  await t.admin`
    INSERT INTO stocks.market_strength (date, stock_id, rs_score, weighted_return) VALUES
      ('2026-09-23', '7301', 88, 0.2), ('2026-09-24', '7301', 91, 0.25)`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /stocks/{id}/indicators', () => {
  it('回最新指標與趨勢判斷：均線多頭排列、站上 MA20/MA60', async () => {
    const { status, body } = await get<Indicators>('/stocks/7301/indicators')
    expect(status).toBe(200)
    expect(body.latest).toMatchObject({
      date: '2026-09-24', close: 110, ma5: 106, ma20: 101, ma60: 96, rsi14: 65.5,
      bullishAlignment: true, aboveMa20: true, aboveMa60: true, rsScore: 91,
    })
  })

  it('序列依日期升冪，欄位轉為 camelCase 數值', async () => {
    const { body } = await get<Indicators>('/stocks/7301/indicators?days=10')
    expect(body.series).toEqual([
      expect.objectContaining({ date: '2026-09-23', ma5: 105, k9: 70, volMa5: 1000, rsScore: 88 }),
      expect.objectContaining({ date: '2026-09-24', ma5: 106, k9: 72, volMa5: 1100, rsScore: 91 }),
    ])
  })

  it('days 限制回傳筆數', async () => {
    const { body } = await get<Indicators>('/stocks/7301/indicators?days=1')
    expect(body.series.map((s) => s.date)).toEqual(['2026-09-24'])
  })

  it('均線不足（MA60 缺值）時站上 MA60 為 null、不算多頭排列', async () => {
    const { body } = await get<Indicators>('/stocks/7302/indicators')
    expect(body.latest).toMatchObject({ bullishAlignment: false, aboveMa20: false, aboveMa60: null, rsScore: null })
  })

  it('沒有指標資料回 latest=null、空序列', async () => {
    expect((await get<Indicators>('/stocks/7303/indicators')).body).toEqual({ latest: null, series: [] })
  })

  it('查無股票 404、days 超出範圍 400', async () => {
    expect((await get('/stocks/9999/indicators')).status).toBe(404)
    expect((await get('/stocks/7301/indicators?days=0')).status).toBe(400)
    expect((await get('/stocks/7301/indicators?days=1000')).status).toBe(400)
  })
})
