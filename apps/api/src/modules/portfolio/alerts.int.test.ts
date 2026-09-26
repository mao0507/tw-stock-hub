// #26 盤後提醒與站內通知
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { startCrawlerDoneListener } from '../../lib/crawler-events.js'
import { createTestUser, seedStock, startTestDb, testConfig, type TestDb, waitFor } from '../../test/harness.js'
import { evaluateAlerts } from './index.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let stopListener: () => Promise<void>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

type Alert = {
  id: string; stockId: string; stockName: string; alertType: string; threshold: number
  isActive: boolean; isTriggered: boolean; triggeredAt: string | null; createdAt: string
}
type Notifications = { unreadCount: number; items: { id: string; title: string; body: string; stockId: string | null; readAt: string | null }[] }

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  stopListener = await startCrawlerDoneListener(t.api.sql, { onQuotes: () => evaluateAlerts(t.api.db) })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '2317', '鴻海')
  // 舊日期的行情不應被拿來判斷
  await t.admin`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct) VALUES
      ('2026-09-23', '2330', 1, 1, 1, 50, 1, 1, 0, -9),
      ('2026-09-24', '2330', 108, 111, 107, 110, 3000000, 1, 2.68, 2.5),
      ('2026-09-24', '2317', 200, 200, 190, 190, 1000, 1, -10, -5)`
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await stopListener?.()
  await t?.stop()
})

beforeEach(async () => {
  await t.admin`DELETE FROM members.notifications`
  await t.admin`DELETE FROM members.alert_rules`
})

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/portfolio${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

async function create(stockId: string, alertType: string, threshold: number, cookie = alice.cookie): Promise<Alert> {
  const res = await send(cookie, 'POST', '/alerts', { stockId, alertType, threshold })
  expect(res.status).toBe(201)
  return (await res.json()) as Alert
}
const list = async (cookie = alice.cookie) => (await (await send(cookie, 'GET', '/alerts')).json()) as Alert[]
const notifications = async (cookie = alice.cookie) =>
  (await (await send(cookie, 'GET', '/notifications')).json()) as Notifications
const quotesDone = () => t.admin`SELECT pg_notify('crawler_done', '{"crawler":"twse_daily"}')`

describe('提醒規則 CRUD', () => {
  it('新增後列出（含股名），只看得到自己的', async () => {
    const a = await create('2330', 'price_above', 100)
    expect(a).toMatchObject({ stockId: '2330', stockName: '台積電', alertType: 'price_above', threshold: 100, isActive: true, isTriggered: false })
    expect((await list()).map((x) => x.id)).toEqual([a.id])
    expect(await list(bob.cookie)).toEqual([])
  })

  it('驗證：未知股票 404、門檻需大於 0、類型需合法、未登入 401', async () => {
    expect((await send(alice.cookie, 'POST', '/alerts', { stockId: '9999', alertType: 'price_above', threshold: 1 })).status).toBe(404)
    expect((await send(alice.cookie, 'POST', '/alerts', { stockId: '2330', alertType: 'price_above', threshold: 0 })).status).toBe(400)
    expect((await send(alice.cookie, 'POST', '/alerts', { stockId: '2330', alertType: 'nope', threshold: 1 })).status).toBe(400)
    expect((await app.request('/api/portfolio/alerts')).status).toBe(401)
  })

  it('刪除自己的規則；刪別人的 404', async () => {
    const a = await create('2330', 'price_above', 100)
    expect((await send(bob.cookie, 'DELETE', `/alerts/${a.id}`)).status).toBe(404)
    expect((await send(alice.cookie, 'DELETE', `/alerts/${a.id}`)).status).toBe(204)
    expect(await list()).toEqual([])
  })
})

describe('盤後評估', () => {
  it('行情任務完成後依最新交易日判斷，成立的寫入通知並標記已觸發', async () => {
    const hit1 = await create('2330', 'price_above', 100)
    await create('2330', 'price_below', 100)
    const hit2 = await create('2330', 'change_above', 2)
    await create('2330', 'change_below', 2)
    const hit3 = await create('2330', 'volume_above', 2000) // 張
    const hit4 = await create('2317', 'change_below', 3) // 跌幅 5% ≥ 3%
    await quotesDone()
    await waitFor(async () => (await notifications()).items.length === 4)

    const triggered = (await list()).filter((a) => a.isTriggered).map((a) => a.id).sort()
    expect(triggered).toEqual([hit1.id, hit2.id, hit3.id, hit4.id].sort())
    const n = await notifications()
    expect(n.unreadCount).toBe(4)
    expect(n.items.find((i) => i.stockId === '2317')).toMatchObject({ title: '鴻海 2317 跌幅達 3%' })
    expect(n.items.find((i) => i.title.includes('股價高於'))!.body).toContain('收盤 110')
  })

  it('已觸發的不重複通知；重設後可再次觸發', async () => {
    const a = await create('2330', 'price_above', 100)
    await evaluateAlerts(t.api.db)
    await evaluateAlerts(t.api.db)
    expect((await notifications()).items).toHaveLength(1)

    const res = await send(alice.cookie, 'PATCH', `/alerts/${a.id}/reset`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as Alert).isTriggered).toBe(false)
    await evaluateAlerts(t.api.db)
    expect((await notifications()).items).toHaveLength(2)
  })

  it('停用的規則不評估；其他爬蟲完成不觸發', async () => {
    const a = await create('2330', 'price_above', 100)
    await t.admin`UPDATE members.alert_rules SET is_active = FALSE WHERE id = ${a.id}`
    await create('2317', 'price_below', 500)
    await t.admin`SELECT pg_notify('crawler_done', '{"crawler":"sector"}')`
    await new Promise((r) => setTimeout(r, 300))
    expect((await notifications()).items).toHaveLength(0)
    await evaluateAlerts(t.api.db)
    expect((await notifications()).items.map((i) => i.stockId)).toEqual(['2317'])
  })
})

describe('通知中心', () => {
  it('標記已讀（指定或全部），只影響自己的通知', async () => {
    await create('2330', 'price_above', 100)
    await create('2317', 'price_below', 500)
    await create('2330', 'price_above', 100, bob.cookie)
    await evaluateAlerts(t.api.db)
    const [first] = (await notifications()).items
    expect((await send(alice.cookie, 'POST', '/notifications/read', { ids: [first!.id] })).status).toBe(204)
    expect((await notifications()).unreadCount).toBe(1)
    await send(alice.cookie, 'POST', '/notifications/read', {})
    expect((await notifications()).unreadCount).toBe(0)
    expect((await notifications(bob.cookie)).unreadCount).toBe(1)
  })
})
