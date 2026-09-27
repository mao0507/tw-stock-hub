// #34 範圍訊號訂閱：自選股全部或某分組，每天彙整成一則通知
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

type Digest = { id: string; groupId: string | null; groupName: string | null; signals: string[]; isActive: boolean; lastNotifiedDate: string | null }
type Notifications = { items: { title: string; body: string; stockId: string | null }[] }

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  stopListener = await startCrawlerDoneListener(t.api.sql, { onSignals: () => evaluateSignalSubscriptions(t.api.db) })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '0056', '元大高股息')
  await seedStock(t.admin, '2317', '鴻海')
  await t.admin`
    INSERT INTO stocks.technical_signals (date, stock_id, signal, side, "values") VALUES
      ('2026-09-23', '2317', 'breakout_60d_high', 'bull', '{}'),
      ('2026-09-24', '2330', 'kd_low_golden_cross', 'bull', '{}'),
      ('2026-09-24', '2330', 'volume_spike', 'bull', '{}'),
      ('2026-09-24', '0056', 'breakout_60d_high', 'bull', '{}'),
      ('2026-09-24', '2317', 'ma_death_cross', 'bear', '{}')`
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await stopListener?.()
  await t?.stop()
})

let groupId: string
beforeEach(async () => {
  await t.admin`DELETE FROM members.notifications`
  await t.admin`DELETE FROM members.signal_digests`
  await t.admin`DELETE FROM members.watchlists`
  await t.admin`DELETE FROM members.watchlist_groups`
  const [g] = await t.admin<{ id: string }[]>`
    INSERT INTO members.watchlist_groups (user_id, name) VALUES (${alice.id}, '存股') RETURNING id`
  groupId = g!.id
  await t.admin`
    INSERT INTO members.watchlists (user_id, stock_id, group_id) VALUES
      (${alice.id}, '2330', ${groupId}), (${alice.id}, '0056', ${groupId}), (${alice.id}, '2317', NULL)`
})

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/portfolio${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
async function create(body: { groupId?: string | null; signals: string[] }, cookie = alice.cookie): Promise<Digest> {
  const res = await send(cookie, 'POST', '/signal-digests', body)
  expect(res.status).toBe(201)
  return (await res.json()) as Digest
}
const list = async (cookie = alice.cookie) => (await (await send(cookie, 'GET', '/signal-digests')).json()) as Digest[]
const notifications = async (cookie = alice.cookie) =>
  (await (await send(cookie, 'GET', '/notifications')).json()) as Notifications

describe('範圍訂閱 CRUD', () => {
  it('建立全部自選股或指定分組的訂閱，列出含分組名；只看得到自己的', async () => {
    const all = await create({ signals: ['breakout_60d_high'] })
    const grp = await create({ groupId, signals: ['kd_low_golden_cross', 'breakout_60d_high'] })
    expect(all).toMatchObject({ groupId: null, groupName: null, signals: ['breakout_60d_high'], isActive: true })
    expect(grp).toMatchObject({ groupId, groupName: '存股' })
    expect((await list()).map((d) => d.id).sort()).toEqual([all.id, grp.id].sort())
    expect(await list(bob.cookie)).toEqual([])
  })

  it('驗證：別人的分組 404、訊號需 1 個以上且合法、未登入 401', async () => {
    expect((await send(bob.cookie, 'POST', '/signal-digests', { groupId, signals: ['breakout_60d_high'] })).status).toBe(404)
    expect((await send(alice.cookie, 'POST', '/signal-digests', { signals: [] })).status).toBe(400)
    expect((await send(alice.cookie, 'POST', '/signal-digests', { signals: ['nope'] })).status).toBe(400)
    expect((await app.request('/api/portfolio/signal-digests')).status).toBe(401)
  })

  it('停用、刪除只能動自己的；刪除分組時一併移除該分組的訂閱', async () => {
    const d = await create({ groupId, signals: ['breakout_60d_high'] })
    expect((await send(bob.cookie, 'PATCH', `/signal-digests/${d.id}`, { isActive: false })).status).toBe(404)
    expect(((await (await send(alice.cookie, 'PATCH', `/signal-digests/${d.id}`, { isActive: false })).json()) as Digest).isActive).toBe(false)
    expect((await send(bob.cookie, 'DELETE', `/signal-digests/${d.id}`)).status).toBe(404)
    await send(alice.cookie, 'DELETE', `/watchlist-groups/${groupId}`)
    expect(await list()).toEqual([])
  })
})

describe('每日彙整', () => {
  it('每個訂閱彙整成一則通知，只含範圍內、指定訊號、最新訊號日的股票', async () => {
    await create({ groupId, signals: ['kd_low_golden_cross', 'volume_spike', 'breakout_60d_high', 'ma_death_cross'] })
    await t.admin`SELECT pg_notify('crawler_done', '{"crawler":"signals","count":4}')`
    await waitFor(async () => (await notifications()).items.length === 1)
    const [n] = (await notifications()).items
    expect(n!.title).toBe('存股 今日訊號（2 檔）')
    expect(n!.body).toContain('2026-09-24')
    expect(n!.body).toContain('0056 元大高股息：突破 60 日新高')
    expect(n!.body).toContain('2330 台積電：KD 低檔黃金交叉、爆量')
    expect(n!.body).not.toContain('鴻海') // 不在分組
    expect(n!.stockId).toBeNull()
  })

  it('全部自選股範圍；同日不重複；沒有符合的不發', async () => {
    await create({ signals: ['ma_death_cross', 'breakout_60d_high'] })
    await create({ signals: ['rsi_oversold'] })
    await evaluateSignalSubscriptions(t.api.db)
    await evaluateSignalSubscriptions(t.api.db)
    const { items } = await notifications()
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('自選股 今日訊號（2 檔）')
    expect(items[0]!.body).toContain('2317 鴻海：MA5 死亡交叉 MA20')
  })

  it('股票移出自選後不再通知該股；停用的不評估', async () => {
    const d = await create({ groupId, signals: ['breakout_60d_high', 'kd_low_golden_cross'] })
    await send(alice.cookie, 'DELETE', '/watchlist/0056')
    await evaluateSignalSubscriptions(t.api.db)
    expect((await notifications()).items[0]!.body).not.toContain('0056')

    await t.admin`DELETE FROM members.notifications`
    await t.admin`UPDATE members.signal_digests SET last_notified_date = NULL`
    await send(alice.cookie, 'PATCH', `/signal-digests/${d.id}`, { isActive: false })
    await evaluateSignalSubscriptions(t.api.db)
    expect((await notifications()).items).toHaveLength(0)
  })
})
