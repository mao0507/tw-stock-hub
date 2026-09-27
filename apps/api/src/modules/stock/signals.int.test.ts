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
