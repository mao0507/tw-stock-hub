// #33 逐檔訊號訂閱：訊號偵測完成後評估，同一訂閱同一交易日只通知一次
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { startCrawlerDoneListener } from '../../lib/crawler-events.js'
import { createTestUser, seedStock, startTestDb, testConfig, type TestDb, waitFor } from '../../test/harness.js'
import { evaluateSignalSubscriptions } from './index.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let stopListener: () => Promise<void>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

type Sub = { id: string; stockId: string; stockName: string; signal: string; isActive: boolean; lastNotifiedDate: string | null }
type Notifications = { items: { title: string; body: string; stockId: string | null }[] }

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  stopListener = await startCrawlerDoneListener(t.api.sql, { onSignals: () => evaluateSignalSubscriptions(t.api.db) })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '2317', '鴻海')
  await t.admin`
    INSERT INTO stocks.technical_signals (date, stock_id, signal, side, "values") VALUES
      ('2026-09-23', '2317', 'ma_death_cross', 'bear', '{}'),
      ('2026-09-24', '2330', 'kd_low_golden_cross', 'bull', '{"k": 21, "d": 19}'),
      ('2026-09-24', '2330', 'volume_spike', 'bear', '{}')`
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await stopListener?.()
  await t?.stop()
})

beforeEach(async () => {
  await t.admin`DELETE FROM members.notifications`
  await t.admin`DELETE FROM members.signal_subscriptions`
})

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/portfolio${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
async function subscribe(stockId: string, signal: string, cookie = alice.cookie): Promise<Sub> {
  const res = await send(cookie, 'POST', '/signal-subscriptions', { stockId, signal })
  expect(res.status).toBe(201)
  return (await res.json()) as Sub
}
const list = async (cookie = alice.cookie) => (await (await send(cookie, 'GET', '/signal-subscriptions')).json()) as Sub[]
const notifications = async (cookie = alice.cookie) =>
  (await (await send(cookie, 'GET', '/notifications')).json()) as Notifications
const signalsDone = (count = 3) => t.admin`SELECT pg_notify('crawler_done', ${JSON.stringify({ crawler: 'signals', count })})`

describe('訊號訂閱 CRUD', () => {
  it('新增後列出（含股名），只看得到自己的；重複訂閱 409', async () => {
    const s = await subscribe('2330', 'kd_low_golden_cross')
    expect(s).toMatchObject({ stockId: '2330', stockName: '台積電', signal: 'kd_low_golden_cross', isActive: true, lastNotifiedDate: null })
    expect((await list()).map((x) => x.id)).toEqual([s.id])
    expect(await list(bob.cookie)).toEqual([])
    expect((await send(alice.cookie, 'POST', '/signal-subscriptions', { stockId: '2330', signal: 'kd_low_golden_cross' })).status).toBe(409)
  })

  it('驗證：未知股票 404、未知訊號 400、未登入 401', async () => {
    expect((await send(alice.cookie, 'POST', '/signal-subscriptions', { stockId: '9999', signal: 'ma_golden_cross' })).status).toBe(404)
    expect((await send(alice.cookie, 'POST', '/signal-subscriptions', { stockId: '2330', signal: 'nope' })).status).toBe(400)
    expect((await app.request('/api/portfolio/signal-subscriptions')).status).toBe(401)
  })

  it('停用／啟用、刪除只能動自己的', async () => {
    const s = await subscribe('2330', 'kd_low_golden_cross')
    expect((await send(bob.cookie, 'PATCH', `/signal-subscriptions/${s.id}`, { isActive: false })).status).toBe(404)
    const res = await send(alice.cookie, 'PATCH', `/signal-subscriptions/${s.id}`, { isActive: false })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Sub).isActive).toBe(false)
    expect((await send(bob.cookie, 'DELETE', `/signal-subscriptions/${s.id}`)).status).toBe(404)
    expect((await send(alice.cookie, 'DELETE', `/signal-subscriptions/${s.id}`)).status).toBe(204)
    expect(await list()).toEqual([])
  })
})

describe('訊號評估', () => {
  it('訊號任務完成後以最新訊號日比對，成立的發通知；舊日期的訊號不算', async () => {
    await subscribe('2330', 'kd_low_golden_cross')
    await subscribe('2317', 'ma_death_cross')
    await signalsDone()
    await waitFor(async () => (await notifications()).items.length === 1)
    const [n] = (await notifications()).items
    expect(n).toMatchObject({ stockId: '2330', title: '台積電 2330 KD 低檔黃金交叉' })
    expect(n!.body).toContain('2026-09-24')
    expect(n!.body).toContain('多方')
    expect((await list()).find((s) => s.stockId === '2330')!.lastNotifiedDate).toBe('2026-09-24')
  })

  it('同一交易日只通知一次；爆量的多空依當日偵測結果', async () => {
    await subscribe('2330', 'volume_spike')
    await evaluateSignalSubscriptions(t.api.db)
    await evaluateSignalSubscriptions(t.api.db)
    const { items } = await notifications()
    expect(items).toHaveLength(1)
    expect(items[0]!.body).toContain('空方')
  })

  it('筆數 0（休市）或其他任務完成不評估；停用的不評估；各自通知各自的', async () => {
    const s = await subscribe('2330', 'kd_low_golden_cross')
    await subscribe('2330', 'kd_low_golden_cross', bob.cookie)
    await signalsDone(0)
    await t.admin`SELECT pg_notify('crawler_done', '{"crawler":"signals_full","count":5}')`
    await new Promise((r) => setTimeout(r, 300))
    expect((await notifications()).items).toHaveLength(0)

    await send(alice.cookie, 'PATCH', `/signal-subscriptions/${s.id}`, { isActive: false })
    await evaluateSignalSubscriptions(t.api.db)
    expect((await notifications()).items).toHaveLength(0)
    expect((await notifications(bob.cookie)).items).toHaveLength(1)
  })
})
