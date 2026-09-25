// #11 買入批次與持股總覽
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createTestUser, seedQuotes, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

type Lot = { id: string; stockId: string; boughtAt: string; price: number; shares: number; fee: number }
type Holding = {
  stockId: string
  name: string
  shares: number
  avgCost: number
  costBasis: number
  price: number | null
  priceDate: string | null
  stale: boolean
  marketValue: number | null
  unrealizedPnl: number | null
  returnPct: number | null
  weight: number | null
}
type Holdings = {
  items: Holding[]
  totals: { costBasis: number; marketValue: number; unrealizedPnl: number; returnPct: number | null; staleCount: number }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '0056', '元大高股息')
  await seedStock(t.admin, '9999', '沒有行情')
  await seedQuotes(t.admin, [
    { date: '2026-09-21', stockId: '2330', close: 118 },
    { date: '2026-09-22', stockId: '2330', close: 120 },
    { date: '2026-09-22', stockId: '0056', close: 40 },
  ])
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

beforeEach(async () => {
  await t.admin`DELETE FROM members.holding_lots`
  await t.admin`DELETE FROM members.holdings`
})

const json = (cookie: string) => ({ Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin })

async function addLot(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/portfolio/lots', { method: 'POST', headers: json(cookie), body: JSON.stringify(body) })
}

async function holdings(cookie: string): Promise<Holdings> {
  const res = await app.request('/api/portfolio/holdings', { headers: { Cookie: cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as Holdings
}

const buy = (stockId: string, boughtAt: string, price: number, shares: number, fee = 0) => ({
  stockId,
  boughtAt,
  price,
  shares,
  fee,
})

describe('驗證與權限', () => {
  it('未登入回 401', async () => {
    expect((await app.request('/api/portfolio/holdings')).status).toBe(401)
    expect((await addLot('', buy('2330', '2026-01-02', 100, 1000))).status).toBe(401)
  })

  it.each([
    ['股數為 0', { shares: 0 }],
    ['股數非整數', { shares: 1.5 }],
    ['價格為 0', { price: 0 }],
    ['價格為負', { price: -1 }],
    ['手續費為負', { fee: -1 }],
    ['日期格式錯', { boughtAt: '2026/01/02' }],
    ['日期在未來', { boughtAt: '2999-01-01' }],
    ['日期不存在（2/30）', { boughtAt: '2026-02-30' }],
    ['單筆股數過大', { shares: 100_000_001 }],
    ['價格過大', { price: 100_001 }],
  ])('%s 回 400', async (_label, patch) => {
    const res = await addLot(alice.cookie, { ...buy('2330', '2026-01-02', 100, 1000), ...patch })
    expect(res.status).toBe(400)
  })

  it('股票代號不存在回 400', async () => {
    const res = await addLot(alice.cookie, buy('0000', '2026-01-02', 100, 1000))
    expect(res.status).toBe(400)
  })

  it('累計股數超過上限回 400（不讓 DB 溢位變成 500），且原本持股不變', async () => {
    expect((await addLot(alice.cookie, buy('2330', '2026-01-02', 1, 60_000_000))).status).toBe(201)
    const res = await addLot(alice.cookie, buy('2330', '2026-01-03', 1, 60_000_000))
    expect(res.status).toBe(400)
    expect((await holdings(alice.cookie)).items[0]!.shares).toBe(60_000_000)
  })

  it('零股可以記錄', async () => {
    const res = await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 37))
    expect(res.status).toBe(201)
    expect(((await res.json()) as Lot).shares).toBe(37)
  })
})

describe('加權平均成本與損益', () => {
  it('多次買入：成本含手續費、加權平均、依最新收盤價算損益', async () => {
    const r1 = await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 1000, 20))
    expect(r1.status).toBe(201)
    expect(await r1.json()).toMatchObject({ stockId: '2330', boughtAt: '2026-01-02', price: 100, shares: 1000, fee: 20 })
    await addLot(alice.cookie, buy('2330', '2026-02-02', 130, 500, 10))

    const { items, totals } = await holdings(alice.cookie)
    expect(items).toHaveLength(1)
    // 成本 = 100*1000+20 + 130*500+10 = 165030；均價 = 165030/1500 = 110.02
    expect(items[0]).toMatchObject({
      stockId: '2330',
      name: '台積電',
      shares: 1500,
      avgCost: 110.02,
      costBasis: 165030,
      price: 120,
      priceDate: '2026-09-22',
      stale: false,
      marketValue: 180000,
      unrealizedPnl: 14970,
      returnPct: 9.07,
      weight: 100,
    })
    expect(totals).toMatchObject({ costBasis: 165030, marketValue: 180000, unrealizedPnl: 14970, returnPct: 9.07, staleCount: 0 })
  })

  it('配置比例依市值計算', async () => {
    await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 1000)) // 市值 120000
    await addLot(alice.cookie, buy('0056', '2026-01-02', 30, 2000)) // 市值 80000
    const { items } = await holdings(alice.cookie)
    const w = Object.fromEntries(items.map((i) => [i.stockId, i.weight]))
    expect(w).toEqual({ '2330': 60, '0056': 40 })
  })

  it('沒有股價的持股標記 stale，不計入總市值與總損益，但計入總成本', async () => {
    await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 1000))
    await addLot(alice.cookie, buy('9999', '2026-01-02', 50, 1000))
    const { items, totals } = await holdings(alice.cookie)
    const stale = items.find((i) => i.stockId === '9999')!
    expect(stale).toMatchObject({ price: null, stale: true, marketValue: null, unrealizedPnl: null, returnPct: null, weight: null })
    expect(totals).toMatchObject({ costBasis: 150000, marketValue: 120000, unrealizedPnl: 20000, returnPct: 20, staleCount: 1 })
    expect(items.find((i) => i.stockId === '2330')!.weight).toBe(100)
  })
})

describe('修改與刪除批次後重算', () => {
  it('修改批次後持股重算', async () => {
    const lot = (await (await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 1000))).json()) as Lot
    const res = await app.request(`/api/portfolio/lots/${lot.id}`, {
      method: 'PATCH',
      headers: json(alice.cookie),
      body: JSON.stringify({ price: 110, shares: 2000 }),
    })
    expect(res.status).toBe(200)
    const { items } = await holdings(alice.cookie)
    expect(items[0]).toMatchObject({ shares: 2000, avgCost: 110, costBasis: 220000 })
  })

  it('刪除其中一批後重算；刪光後持股消失', async () => {
    const a = (await (await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 1000))).json()) as Lot
    const b = (await (await addLot(alice.cookie, buy('2330', '2026-02-02', 130, 1000))).json()) as Lot

    expect((await app.request(`/api/portfolio/lots/${a.id}`, { method: 'DELETE', headers: json(alice.cookie) })).status).toBe(204)
    expect((await holdings(alice.cookie)).items[0]).toMatchObject({ shares: 1000, avgCost: 130 })

    await app.request(`/api/portfolio/lots/${b.id}`, { method: 'DELETE', headers: json(alice.cookie) })
    expect((await holdings(alice.cookie)).items).toEqual([])
  })

  it('列出某檔股票的批次（依日期）', async () => {
    await addLot(alice.cookie, buy('2330', '2026-02-02', 130, 500))
    await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 1000))
    await addLot(alice.cookie, buy('0056', '2026-01-02', 30, 1000))
    const res = await app.request('/api/portfolio/lots?stockId=2330', { headers: { Cookie: alice.cookie } })
    const lots = (await res.json()) as Lot[]
    expect(lots.map((l) => l.boughtAt)).toEqual(['2026-01-02', '2026-02-02'])
  })
})

describe('使用者隔離', () => {
  it('B 看不到、也改不到 A 的資料', async () => {
    const lot = (await (await addLot(alice.cookie, buy('2330', '2026-01-02', 100, 1000))).json()) as Lot

    expect((await holdings(bob.cookie)).items).toEqual([])
    const lots = await app.request('/api/portfolio/lots?stockId=2330', { headers: { Cookie: bob.cookie } })
    expect(await lots.json()).toEqual([])

    const patch = await app.request(`/api/portfolio/lots/${lot.id}`, {
      method: 'PATCH',
      headers: json(bob.cookie),
      body: JSON.stringify({ shares: 1 }),
    })
    expect(patch.status).toBe(404)
    const del = await app.request(`/api/portfolio/lots/${lot.id}`, { method: 'DELETE', headers: json(bob.cookie) })
    expect(del.status).toBe(404)
    expect((await holdings(alice.cookie)).items[0]!.shares).toBe(1000)
  })
})
