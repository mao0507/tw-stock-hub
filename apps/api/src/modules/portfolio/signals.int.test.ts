// #31 今日訊號：只看自己的自選股／持股
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createTestUser, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

type Today = { date: string | null; items: { stockId: string; signal: string; inWatchlist: boolean; inHoldings: boolean }[] }
const get = async (cookie: string, q: string) => {
  const res = await app.request(`/api/portfolio/signals/today${q}`, { headers: { Cookie: cookie } })
  return { status: res.status, body: (await res.json()) as Today }
}
const ids = async (cookie: string, q: string) => (await get(cookie, q)).body.items.map((i) => `${i.stockId}:${i.signal}`)

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  for (const [id, name] of [['2330', '台積電'], ['2317', '鴻海'], ['2454', '聯發科']] as const) await seedStock(t.admin, id, name)
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
  await t.admin`
    INSERT INTO stocks.technical_signals (date, stock_id, signal, side, "values") VALUES
      ('2026-09-23', '2330', 'ma_golden_cross', 'bull', '{}'),
      ('2026-09-24', '2330', 'kd_low_golden_cross', 'bull', '{}'),
      ('2026-09-24', '2317', 'ma_death_cross', 'bear', '{}'),
      ('2026-09-24', '2454', 'volume_spike', 'bull', '{}')`
  // alice：自選 2330、持有 2317；bob：自選 2454
  await t.admin`INSERT INTO members.watchlists (user_id, stock_id) VALUES (${alice.id}, '2330'), (${bob.id}, '2454')`
  await t.admin`INSERT INTO members.holdings (user_id, stock_id, shares, avg_cost) VALUES (${alice.id}, '2317', 1000, 100)`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /portfolio/signals/today', () => {
  it('scope=watchlist／holdings／mine 只回自己的股票最新訊號日的訊號', async () => {
    expect(await ids(alice.cookie, '?scope=watchlist')).toEqual(['2330:kd_low_golden_cross'])
    expect(await ids(alice.cookie, '?scope=holdings')).toEqual(['2317:ma_death_cross'])
    expect(await ids(alice.cookie, '?scope=mine')).toEqual(['2317:ma_death_cross', '2330:kd_low_golden_cross'])
    expect(await ids(bob.cookie, '?scope=mine')).toEqual(['2454:volume_spike'])
  })

  it('標示屬於自選或持股；日期為全市場最新訊號日', async () => {
    const { body } = await get(alice.cookie, '?scope=mine')
    expect(body.date).toBe('2026-09-24')
    expect(body.items.find((i) => i.stockId === '2317')).toMatchObject({ inHoldings: true, inWatchlist: false })
  })

  it('未登入 401；scope 不合法 400', async () => {
    expect((await app.request('/api/portfolio/signals/today?scope=mine')).status).toBe(401)
    expect((await get(alice.cookie, '?scope=nope')).status).toBe(400)
  })
})
