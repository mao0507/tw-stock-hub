// #13 除息日持股股利
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { startCrawlerDoneListener } from '../../lib/crawler-events.js'
import { createTestUser, seedStock, startTestDb, testConfig, type TestDb, waitFor } from '../../test/harness.js'
import { recomputeDividendsForStock } from './index.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let stopListener: () => Promise<void>
let alice: { id: string; cookie: string }

type Entitlement = { stockId: string; exDate: string; cashPerShare: number; shares: number; amount: number }
type Holdings = {
  items: { stockId: string; shares: number; earnedDividend: number }[]
  closed: { stockId: string; earnedDividend: number }[]
  totals: { earnedDividend: number }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  stopListener = await startCrawlerDoneListener(t.api.sql, {
    onExDividend: () => recomputeDividendsForStock(t.api.db),
  })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '0056', '元大高股息')
  alice = await createTestUser(t.admin, 'alice@example.com')
}, 120_000)

afterAll(async () => {
  await stopListener?.()
  await t?.stop()
})

beforeEach(async () => {
  await t.admin`DELETE FROM members.sell_transactions`
  await t.admin`DELETE FROM members.holding_lots`
  await t.admin`DELETE FROM members.holdings`
  await t.admin`DELETE FROM stocks.ex_dividend_calendar`
  await t.admin`DELETE FROM stocks.dividends`
})

const headers = { Cookie: '', 'Content-Type': 'application/json', Origin: testConfig.webOrigin }
const post = (path: string, body: unknown) =>
  app.request(`/api/portfolio${path}`, {
    method: 'POST',
    headers: { ...headers, Cookie: alice.cookie },
    body: JSON.stringify(body),
  })

async function buy(stockId: string, boughtAt: string, shares: number) {
  const res = await post('/lots', { stockId, boughtAt, price: 100, shares, fee: 0 })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string }
}

async function sell(stockId: string, soldAt: string, shares: number) {
  const res = await post('/sells', { stockId, soldAt, price: 100, shares, fee: 0, tax: 0 })
  expect(res.status).toBe(201)
}

async function exDividend(stockId: string, exDate: string, cash: number) {
  await t.admin`
    INSERT INTO stocks.ex_dividend_calendar (ex_date, stock_id, cash_dividend)
    VALUES (${exDate}, ${stockId}, ${cash})`
}

// 歷史股利（FinMind 回補，含除息日）；行事曆只有近期預告
async function historicalDividend(stockId: string, year: string, period: string, exDate: string | null, cash: number) {
  await t.admin`
    INSERT INTO stocks.dividends (stock_id, dividend_year, period, cash_dividend, stock_dividend, ex_dividend_date)
    VALUES (${stockId}, ${year}, ${period}, ${cash}, 0, ${exDate})`
}

async function entitlements(stockId = '2330'): Promise<Entitlement[]> {
  const res = await app.request(`/api/portfolio/dividends?stockId=${stockId}`, { headers: { Cookie: alice.cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as Entitlement[]
}

async function holdings(): Promise<Holdings> {
  return (await (await app.request('/api/portfolio/holdings', { headers: { Cookie: alice.cookie } })).json()) as Holdings
}

describe('除息日持股計算', () => {
  it('除息日前一天買入才算；除息日當天買入不算；除息日當天賣出仍算', async () => {
    await exDividend('2330', '2026-07-10', 2.5)
    await buy('2330', '2026-07-09', 1000) // 算
    await buy('2330', '2026-07-10', 500) // 除息日當天買：不算
    await sell('2330', '2026-07-10', 300) // 除息日當天賣：仍領得到

    expect(await entitlements()).toEqual([
      { stockId: '2330', exDate: '2026-07-10', cashPerShare: 2.5, shares: 1000, amount: 2500 },
    ])
    const h = await holdings()
    expect(h.items[0]).toMatchObject({ shares: 1200, earnedDividend: 2500 })
    expect(h.totals.earnedDividend).toBe(2500)
  })

  it('除息日前賣出的股數不算', async () => {
    await exDividend('2330', '2026-07-10', 2.5)
    await buy('2330', '2026-07-01', 1000)
    await sell('2330', '2026-07-09', 400)
    expect((await entitlements())[0]).toMatchObject({ shares: 600, amount: 1500 })
  })

  it('除息日隔天才買的股票沒有股利紀錄', async () => {
    await exDividend('2330', '2026-07-10', 2.5)
    await buy('2330', '2026-07-11', 1000)
    expect(await entitlements()).toEqual([])
    expect((await holdings()).items[0]!.earnedDividend).toBe(0)
  })

  it('多次除息依日期列出並累計；零股金額四捨五入到元以下兩位', async () => {
    await exDividend('0056', '2026-04-15', 0.866)
    await exDividend('0056', '2026-07-15', 1.07)
    await buy('0056', '2026-01-02', 37)
    const list = await entitlements('0056')
    expect(list.map((e) => [e.exDate, e.shares, e.amount])).toEqual([
      ['2026-04-15', 37, 32.04],
      ['2026-07-15', 37, 39.59],
    ])
    expect((await holdings()).items[0]!.earnedDividend).toBe(71.63)
  })

  it('尚未到來的除息日不列入已領', async () => {
    await exDividend('2330', '2999-07-10', 2.5)
    await buy('2330', '2026-07-01', 1000)
    expect(await entitlements()).toEqual([])
  })

  it('賣光的股票仍保留已領股利', async () => {
    await exDividend('2330', '2026-07-10', 2.5)
    await buy('2330', '2026-07-01', 1000)
    await sell('2330', '2026-08-01', 1000)
    const h = await holdings()
    expect(h.closed[0]).toMatchObject({ stockId: '2330', earnedDividend: 2500 })
    expect(h.totals.earnedDividend).toBe(2500)
  })

  it('歷史股利（dividends 表有除息日）也列入；與行事曆同一天只算一次', async () => {
    await historicalDividend('2330', '113', '1', '2024-09-12', 4)
    await historicalDividend('2330', '114', '1', '2026-07-10', 2.5)
    await historicalDividend('2330', '115', '1', null, 9) // 無除息日：無法判斷持有，不列入
    await exDividend('2330', '2026-07-10', 2.5)
    await buy('2330', '2024-01-02', 1000)
    expect((await entitlements()).map((e) => [e.exDate, e.amount])).toEqual([
      ['2024-09-12', 4000],
      ['2026-07-10', 2500],
    ])
  })

  it('補登買入後股利自動重算', async () => {
    await exDividend('2330', '2026-07-10', 2.5)
    await buy('2330', '2026-07-01', 1000)
    await buy('2330', '2026-06-01', 1000)
    expect((await entitlements())[0]).toMatchObject({ shares: 2000, amount: 5000 })
  })
})

describe('除權息資料更新', () => {
  it('新的除息資料進來並 NOTIFY exdividend 後，股利自動更新', async () => {
    await buy('2330', '2026-07-01', 1000)
    expect((await holdings()).items[0]!.earnedDividend).toBe(0)

    await exDividend('2330', '2026-07-10', 3)
    await t.admin`SELECT pg_notify('crawler_done', '{"crawler":"exdividend"}')`
    await waitFor(async () => (await holdings()).items[0]!.earnedDividend === 3000)
  })

  it('某一筆持股重算失敗（例如舊資料超賣）時，其他持股仍會更新', async () => {
    const bob = await createTestUser(t.admin, `bob-${Date.now()}@example.com`)
    await buy('2330', '2026-07-01', 1000)
    // 直接寫入不合法資料：bob 沒有買入卻有賣出，重播必定超賣
    await t.admin`
      INSERT INTO members.holdings (user_id, stock_id, shares, avg_cost) VALUES (${bob.id}, '2330', 0, 0)`
    await t.admin`
      INSERT INTO members.sell_transactions (user_id, stock_id, sold_at, price, shares, avg_cost_at_sale, realized_pnl)
      VALUES (${bob.id}, '2330', '2026-07-02', 100, 10, 0, 0)`

    await exDividend('2330', '2026-07-10', 3)
    const updated = await recomputeDividendsForStock(t.api.db)
    expect(updated.failed).toBe(1)
    expect((await holdings()).items[0]!.earnedDividend).toBe(3000)
  })

  it('股利歷史回補（finmind_dividends）完成後也會重算', async () => {
    await buy('2330', '2024-01-02', 1000)
    await historicalDividend('2330', '113', '1', '2024-09-12', 4)
    await t.admin`SELECT pg_notify('crawler_done', '{"crawler":"finmind_dividends"}')`
    await waitFor(async () => (await holdings()).items[0]!.earnedDividend === 4000)
  })

  it('其他爬蟲完成不觸發股利重算', async () => {
    await buy('2330', '2026-07-01', 1000)
    await exDividend('2330', '2026-07-10', 3)
    await t.admin`SELECT pg_notify('crawler_done', '{"crawler":"twse_daily"}')`
    await new Promise((r) => setTimeout(r, 300))
    expect((await holdings()).items[0]!.earnedDividend).toBe(0)
  })
})
