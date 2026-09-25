// #12 賣出與全量重算
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createTestUser, seedQuotes, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

type Sell = {
  id: string
  stockId: string
  soldAt: string
  price: number
  shares: number
  fee: number
  tax: number
  avgCostAtSale: number
  realizedPnl: number
}
type Holdings = {
  items: { stockId: string; shares: number; avgCost: number; costBasis: number; realizedPnl: number }[]
  closed: { stockId: string; name: string; realizedPnl: number }[]
  totals: { costBasis: number; realizedPnl: number }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '2330', '台積電')
  await seedQuotes(t.admin, [{ date: '2026-09-22', stockId: '2330', close: 120 }])
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

beforeEach(async () => {
  await t.admin`DELETE FROM members.sell_transactions`
  await t.admin`DELETE FROM members.holding_lots`
  await t.admin`DELETE FROM members.holdings`
})

const headers = (cookie: string) => ({ Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin })
const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/portfolio${path}`, { method, headers: headers(cookie), body: body ? JSON.stringify(body) : undefined })

async function buy(boughtAt: string, price: number, shares: number, fee = 0, cookie = alice.cookie) {
  const res = await send(cookie, 'POST', '/lots', { stockId: '2330', boughtAt, price, shares, fee })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string }
}

const sell = (soldAt: string, price: number, shares: number, fee = 0, tax = 0, cookie = alice.cookie) =>
  send(cookie, 'POST', '/sells', { stockId: '2330', soldAt, price, shares, fee, tax })

async function holdings(cookie = alice.cookie): Promise<Holdings> {
  const res = await app.request('/api/portfolio/holdings', { headers: { Cookie: cookie } })
  return (await res.json()) as Holdings
}

async function sells(cookie = alice.cookie): Promise<Sell[]> {
  const res = await app.request('/api/portfolio/sells?stockId=2330', { headers: { Cookie: cookie } })
  return (await res.json()) as Sell[]
}

describe('賣出與已實現損益', () => {
  it('部分賣出：均價不變、已實現損益扣手續費與稅', async () => {
    await buy('2026-01-02', 100, 1000)
    const res = await sell('2026-03-02', 120, 400, 20, 144)
    expect(res.status).toBe(201)
    // 120*400 − 20 − 144 − 100*400 = 7836
    expect(await res.json()).toMatchObject({ shares: 400, avgCostAtSale: 100, realizedPnl: 7836 })

    const { items, totals } = await holdings()
    expect(items[0]).toMatchObject({ shares: 600, avgCost: 100, costBasis: 60000, realizedPnl: 7836 })
    expect(totals.realizedPnl).toBe(7836)
  })

  it('賣光後保留已實現損益（出現在已出清清單），再買入時均價重新計算', async () => {
    await buy('2026-01-02', 100, 1000)
    expect((await sell('2026-02-02', 110, 1000)).status).toBe(201)

    let h = await holdings()
    expect(h.items).toEqual([])
    expect(h.closed).toEqual([{ stockId: '2330', name: '台積電', realizedPnl: 10000 }])
    expect(h.totals.realizedPnl).toBe(10000)

    await buy('2026-03-02', 90, 500)
    h = await holdings()
    expect(h.items[0]).toMatchObject({ shares: 500, avgCost: 90, costBasis: 45000, realizedPnl: 10000 })
    expect(h.closed).toEqual([])
  })

  it('上限內的大額獲利不會讓 DB 溢位', async () => {
    await buy('2026-01-02', 1, 20_000_000)
    const res = await sell('2026-02-02', 60_001, 20_000_000)
    expect(res.status).toBe(201)
    expect(((await res.json()) as Sell).realizedPnl).toBe(1_200_000_000_000)
  })

  it('同一天先買後賣：可以賣出當天買的股票', async () => {
    await buy('2026-03-02', 100, 1000)
    expect((await sell('2026-03-02', 101, 1000)).status).toBe(201)
  })

  it('補登較早的買入後，後續賣出的均價與損益全部重算', async () => {
    await buy('2026-01-10', 100, 1000)
    await sell('2026-02-01', 120, 500)
    expect((await sells())[0]).toMatchObject({ avgCostAtSale: 100, realizedPnl: 10000 })

    await buy('2026-01-20', 130, 1000)
    // 賣出時均價 = (100000 + 130000) / 2000 = 115；損益 = 500 × (120 − 115)
    expect((await sells())[0]).toMatchObject({ avgCostAtSale: 115, realizedPnl: 2500 })
    expect((await holdings()).items[0]).toMatchObject({ shares: 1500, avgCost: 115, realizedPnl: 2500 })
  })

  it('修改與刪除賣出後重算', async () => {
    await buy('2026-01-02', 100, 1000)
    const s = (await (await sell('2026-02-02', 120, 400)).json()) as Sell

    expect((await send(alice.cookie, 'PATCH', `/sells/${s.id}`, { shares: 100 })).status).toBe(200)
    expect((await holdings()).items[0]).toMatchObject({ shares: 900, realizedPnl: 2000 })

    expect((await send(alice.cookie, 'DELETE', `/sells/${s.id}`)).status).toBe(204)
    expect((await holdings()).items[0]).toMatchObject({ shares: 1000, realizedPnl: 0 })
  })
})

describe('超賣一律 409 且資料不變', () => {
  it('賣出超過持有股數', async () => {
    await buy('2026-01-02', 100, 1000)
    const res = await sell('2026-02-02', 120, 1500)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toMatch(/超賣/)
    expect(await sells()).toEqual([])
    expect((await holdings()).items[0]!.shares).toBe(1000)
  })

  it('賣出日早於買入日（當時尚未持有）', async () => {
    await buy('2026-03-02', 100, 1000)
    expect((await sell('2026-02-02', 120, 100)).status).toBe(409)
  })

  it('刪除買入造成後續賣出超賣：回 409，批次仍在，並指出是哪一筆賣出', async () => {
    const lot = await buy('2026-01-02', 100, 1000)
    const s = (await (await sell('2026-02-02', 120, 600)).json()) as Sell

    const res = await send(alice.cookie, 'DELETE', `/lots/${lot.id}`)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ sellId: s.id })
    expect((await holdings()).items[0]).toMatchObject({ shares: 400 })
  })

  it('把買入股數改少造成超賣：回 409', async () => {
    const lot = await buy('2026-01-02', 100, 1000)
    await sell('2026-02-02', 120, 600)
    expect((await send(alice.cookie, 'PATCH', `/lots/${lot.id}`, { shares: 500 })).status).toBe(409)
  })

  it('把買入日期改到賣出之後造成超賣：回 409', async () => {
    const lot = await buy('2026-01-02', 100, 1000)
    await sell('2026-02-02', 120, 600)
    expect((await send(alice.cookie, 'PATCH', `/lots/${lot.id}`, { boughtAt: '2026-03-02' })).status).toBe(409)
  })
})

describe('驗證與隔離', () => {
  it.each([
    ['稅為負', { tax: -1 }],
    ['手續費為負', { fee: -1 }],
    ['股數為 0', { shares: 0 }],
    ['日期不存在', { soldAt: '2026-02-30' }],
  ])('%s 回 400', async (_label, patch) => {
    await buy('2026-01-02', 100, 1000)
    const res = await send(alice.cookie, 'POST', '/sells', {
      stockId: '2330', soldAt: '2026-02-02', price: 120, shares: 100, fee: 0, tax: 0, ...patch,
    })
    expect(res.status).toBe(400)
  })

  it('B 改不到、刪不到 A 的賣出', async () => {
    await buy('2026-01-02', 100, 1000)
    const s = (await (await sell('2026-02-02', 120, 100)).json()) as Sell
    expect((await send(bob.cookie, 'PATCH', `/sells/${s.id}`, { shares: 1 })).status).toBe(404)
    expect((await send(bob.cookie, 'DELETE', `/sells/${s.id}`)).status).toBe(404)
    expect(await sells(bob.cookie)).toEqual([])
  })
})
