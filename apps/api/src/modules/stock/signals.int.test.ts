// #29 技術訊號：個股訊號歷史
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Signal = { date: string; signal: string; side: 'bull' | 'bear'; values: Record<string, number> }
const get = async (path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as Signal[] }
}

async function signal(date: string, stockId: string, code: string, side: 'bull' | 'bear', values: object = {}) {
  await t.admin`
    INSERT INTO stocks.technical_signals (date, stock_id, signal, side, "values")
    VALUES (${date}, ${stockId}, ${code}, ${side}, ${t.admin.json(values as Record<string, number>)})`
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '2317', '鴻海')
  await signal('2026-05-01', '2330', 'ma_golden_cross', 'bull')
  await signal('2026-09-23', '2330', 'kd_low_golden_cross', 'bull', { k: 21, d: 19 })
  await signal('2026-09-24', '2330', 'breakout_60d_high', 'bull', { close: 110, prior_high: 105 })
  await signal('2026-09-24', '2330', 'rsi_overbought', 'bear', { rsi: 72 })
  await signal('2026-09-24', '2317', 'ma_death_cross', 'bear')
  await t.admin`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct) VALUES
      ('2026-09-24', '2330', 1, 1, 1, 110, 1, 1, 2, 1.85), ('2026-09-24', '2317', 1, 1, 1, 200, 1, 1, -3, -1.48)`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /stocks/{id}/signals', () => {
  it('預設回最近 90 天（以該股最新訊號日往回），新到舊、同日依代碼排序，只含該股', async () => {
    const { status, body } = await get('/stocks/2330/signals')
    expect(status).toBe(200)
    expect(body.map((s) => [s.date, s.signal])).toEqual([
      ['2026-09-24', 'breakout_60d_high'],
      ['2026-09-24', 'rsi_overbought'],
      ['2026-09-23', 'kd_low_golden_cross'],
    ])
    expect(body[2]).toEqual({ date: '2026-09-23', signal: 'kd_low_golden_cross', side: 'bull', values: { k: 21, d: 19 } })
  })

  it('from / to 指定區間', async () => {
    const { body } = await get('/stocks/2330/signals?from=2026-01-01&to=2026-06-30')
    expect(body.map((s) => s.signal)).toEqual(['ma_golden_cross'])
  })

  it('沒有訊號回空陣列；查無股票 404；區間錯誤或超過 3 年回 400', async () => {
    await seedStock(t.admin, '2412', '中華電')
    expect((await get('/stocks/2412/signals')).body).toEqual([])
    expect((await get('/stocks/9999/signals')).status).toBe(404)
    expect((await get('/stocks/2330/signals?from=2026-09-30&to=2026-09-01')).status).toBe(400)
    expect((await get('/stocks/2330/signals?from=2020-01-01&to=2026-09-01')).status).toBe(400)
  })
})

type Today = {
  date: string | null
  items: { stockId: string; stockName: string; close: number | null; changePct: number | null; signal: string; side: string; values: Record<string, number> }[]
}
const today = async (q = '') => {
  const res = await app.request(`/api/signals/today${q}`)
  return { status: res.status, body: (await res.json()) as Today }
}

describe('GET /signals/today', () => {
  it('最新訊號日的全市場訊號，附股名、收盤、漲跌幅，依訊號代碼再依股票排序', async () => {
    const { status, body } = await today()
    expect(status).toBe(200)
    expect(body.date).toBe('2026-09-24')
    expect(body.items.map((i) => [i.signal, i.stockId])).toEqual([
      ['breakout_60d_high', '2330'],
      ['ma_death_cross', '2317'],
      ['rsi_overbought', '2330'],
    ])
    expect(body.items[0]).toMatchObject({ stockName: '台積電', close: 110, changePct: 1.85, side: 'bull' })
  })

  it('依多空、訊號代碼篩選；代碼不合法 400', async () => {
    expect((await today('?side=bear')).body.items.map((i) => i.signal)).toEqual(['ma_death_cross', 'rsi_overbought'])
    expect((await today('?signal=ma_death_cross')).body.items.map((i) => i.stockId)).toEqual(['2317'])
    expect((await today('?signal=nope!')).status).toBe(400)
  })
})
