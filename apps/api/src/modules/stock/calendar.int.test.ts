// #9 除權息行事曆
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
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
  await t.admin`
    INSERT INTO stocks.ex_dividend_calendar (ex_date, stock_id, stock_name, cash_dividend, stock_dividend_ratio) VALUES
      ('2026-07-10', '2330', '台積電', 5, NULL),
      ('2026-07-10', '0056', '元大高股息', 1.07, NULL),
      ('2026-07-15', '2884', '玉山金', 0.6, 0.05),
      ('2026-08-01', '1101', '台泥', NULL, NULL)`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /api/calendar/ex-dividend', () => {
  it('區間內依除息日、代號排序', async () => {
    expect((await get('/calendar/ex-dividend?from=2026-07-01&to=2026-07-31')).body).toEqual([
      { exDate: '2026-07-10', stockId: '0056', stockName: '元大高股息', cashDividend: 1.07, stockDividendRatio: null },
      { exDate: '2026-07-10', stockId: '2330', stockName: '台積電', cashDividend: 5, stockDividendRatio: null },
      { exDate: '2026-07-15', stockId: '2884', stockName: '玉山金', cashDividend: 0.6, stockDividendRatio: 0.05 },
    ])
  })

  it('區間內無資料回空陣列', async () => {
    expect((await get('/calendar/ex-dividend?from=2026-01-01&to=2026-01-31')).body).toEqual([])
  })

  it('from 晚於 to、區間超過一年或日期不存在回 400', async () => {
    expect((await get('/calendar/ex-dividend?from=2026-08-01&to=2026-07-01')).status).toBe(400)
    expect((await get('/calendar/ex-dividend?from=2025-01-01&to=2026-07-01')).status).toBe(400)
    expect((await get('/calendar/ex-dividend?from=2026-02-30&to=2026-03-01')).status).toBe(400)
    expect((await get('/calendar/ex-dividend')).status).toBe(400)
  })
})
