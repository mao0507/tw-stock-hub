// #10 自選股分組
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createTestUser, seedQuotes, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

type Group = { id: string; name: string; color: string | null; sortOrder: number }
type Item = {
  id: string
  stockId: string
  name: string
  groupId: string | null
  note: string | null
  sortOrder: number
  close: number | null
  change: number | null
  changePct: number | null
  priceDate: string | null
}
type Watchlist = { groups: Group[]; items: Item[] }

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '0056', '元大高股息')
  await seedStock(t.admin, '2317', '鴻海')
  await seedQuotes(t.admin, [{ date: '2026-09-22', stockId: '2330', close: 1010 }])
  await t.admin`UPDATE stocks.daily_quotes SET change = 10, change_pct = 1 WHERE stock_id = '2330'`
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

beforeEach(async () => {
  await t.admin`DELETE FROM members.watchlists`
  await t.admin`DELETE FROM members.watchlist_groups`
})

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/portfolio${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

async function list(cookie = alice.cookie): Promise<Watchlist> {
  const res = await send(cookie, 'GET', '/watchlist')
  expect(res.status).toBe(200)
  return (await res.json()) as Watchlist
}

async function createGroup(name: string, color?: string, cookie = alice.cookie): Promise<Group> {
  const res = await send(cookie, 'POST', '/watchlist-groups', { name, color })
  expect(res.status).toBe(201)
  return (await res.json()) as Group
}

const add = (stockId: string, extra: Record<string, unknown> = {}, cookie = alice.cookie) =>
  send(cookie, 'POST', '/watchlist', { stockId, ...extra })

describe('權限', () => {
  it('未登入回 401', async () => {
    expect((await app.request('/api/portfolio/watchlist')).status).toBe(401)
    expect((await send('', 'POST', '/watchlist-groups', { name: 'x' })).status).toBe(401)
  })
})

describe('自選股', () => {
  it('新增後清單附名稱與最新收盤價、漲跌', async () => {
    const res = await add('2330', { note: '長期持有' })
    expect(res.status).toBe(201)
    const { items } = await list()
    expect(items).toEqual([
      expect.objectContaining({
        stockId: '2330',
        name: '台積電',
        groupId: null,
        note: '長期持有',
        close: 1010,
        change: 10,
        changePct: 1,
        priceDate: '2026-09-22',
      }),
    ])
  })

  it('沒有行情的股票價格欄位為 null', async () => {
    await add('0056')
    expect((await list()).items[0]).toMatchObject({ stockId: '0056', close: null, changePct: null })
  })

  it('重複加入回 409', async () => {
    await add('2330')
    expect((await add('2330')).status).toBe(409)
  })

  it('股票不存在回 400', async () => {
    expect((await add('0000')).status).toBe(400)
  })

  it('修改備註、移動分組；刪除後消失', async () => {
    const g = await createGroup('高股息')
    await add('0056')
    const patch = await send(alice.cookie, 'PATCH', '/watchlist/0056', { note: '存股', groupId: g.id })
    expect(patch.status).toBe(200)
    expect((await list()).items[0]).toMatchObject({ note: '存股', groupId: g.id })

    expect((await send(alice.cookie, 'PATCH', '/watchlist/0056', { groupId: null })).status).toBe(200)
    expect((await list()).items[0]!.groupId).toBeNull()

    expect((await send(alice.cookie, 'DELETE', '/watchlist/0056')).status).toBe(204)
    expect((await list()).items).toEqual([])
    expect((await send(alice.cookie, 'DELETE', '/watchlist/0056')).status).toBe(404)
  })

  it('新增時可直接指定分組', async () => {
    const g = await createGroup('成長股')
    expect((await add('2330', { groupId: g.id })).status).toBe(201)
    expect((await list()).items[0]!.groupId).toBe(g.id)
  })

  it('新項目排在同分組最後；可用 sortOrder 調整順序', async () => {
    await add('2330')
    await add('0056')
    await add('2317')
    expect((await list()).items.map((i) => i.stockId)).toEqual(['2330', '0056', '2317'])

    await send(alice.cookie, 'PATCH', '/watchlist/2317', { sortOrder: -1 })
    expect((await list()).items.map((i) => i.stockId)).toEqual(['2317', '2330', '0056'])
  })
})

describe('排序一致性', () => {
  it('移到其他分組時排在該分組最後', async () => {
    const g = await createGroup('G')
    await add('2330', { groupId: g.id })
    await add('0056', { groupId: g.id })
    await add('2317') // 未分組，sortOrder 0
    await send(alice.cookie, 'PATCH', '/watchlist/2317', { groupId: g.id })
    const items = (await list()).items.filter((i) => i.groupId === g.id)
    expect(items.map((i) => i.stockId)).toEqual(['2330', '0056', '2317'])
    expect(new Set(items.map((i) => i.sortOrder)).size).toBe(3)
  })

  it('刪除分組時組內股票接在未分組最後，順序不衝突', async () => {
    const g = await createGroup('G')
    await add('2317') // 未分組
    await add('2330', { groupId: g.id })
    await add('0056', { groupId: g.id })
    await send(alice.cookie, 'DELETE', `/watchlist-groups/${g.id}`)
    const items = (await list()).items
    expect(items.map((i) => i.stockId)).toEqual(['2317', '2330', '0056'])
    expect(new Set(items.map((i) => i.sortOrder)).size).toBe(3)
  })

  it('PUT /watchlist/order 一次設定分組內順序', async () => {
    await add('2330')
    await add('0056')
    await add('2317')
    const res = await send(alice.cookie, 'PUT', '/watchlist/order', { groupId: null, stockIds: ['2317', '2330', '0056'] })
    expect(res.status).toBe(204)
    expect((await list()).items.map((i) => i.stockId)).toEqual(['2317', '2330', '0056'])
  })

  it('PUT /watchlist/order 清單與該分組實際內容不符回 400', async () => {
    const g = await createGroup('G')
    await add('2330')
    await add('0056', { groupId: g.id })
    const res = await send(alice.cookie, 'PUT', '/watchlist/order', { groupId: null, stockIds: ['2330', '0056'] })
    expect(res.status).toBe(400)
  })

  it('PUT /watchlist-groups/order 一次設定分組順序', async () => {
    const a = await createGroup('A')
    const b = await createGroup('B')
    const c = await createGroup('C')
    expect((await send(alice.cookie, 'PUT', '/watchlist-groups/order', { ids: [c.id, a.id, b.id] })).status).toBe(204)
    expect((await list()).groups.map((g) => g.name)).toEqual(['C', 'A', 'B'])
    expect((await send(bob.cookie, 'PUT', '/watchlist-groups/order', { ids: [a.id] })).status).toBe(400)
  })
})

describe('分組', () => {
  it('建立、改名、上色、排序', async () => {
    const a = await createGroup('A', '#ef4444')
    const b = await createGroup('B')
    expect(a).toMatchObject({ name: 'A', color: '#ef4444' })
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder)

    const res = await send(alice.cookie, 'PATCH', `/watchlist-groups/${b.id}`, {
      name: '高股息',
      color: '#22c55e',
      sortOrder: a.sortOrder - 1,
    })
    expect(res.status).toBe(200)
    const { groups } = await list()
    expect(groups.map((g) => g.name)).toEqual(['高股息', 'A'])
    expect(groups[0]!.color).toBe('#22c55e')
  })

  it.each([
    ['名稱空白', { name: '  ' }],
    ['名稱過長', { name: 'x'.repeat(31) }],
    ['顏色格式錯誤', { name: 'ok', color: 'red' }],
  ])('%s 回 400', async (_label, body) => {
    expect((await send(alice.cookie, 'POST', '/watchlist-groups', body)).status).toBe(400)
  })

  it('刪除分組時，組內股票變成未分組而不是被刪除', async () => {
    const g = await createGroup('短線')
    await add('2330', { groupId: g.id })
    expect((await send(alice.cookie, 'DELETE', `/watchlist-groups/${g.id}`)).status).toBe(204)
    const { groups, items } = await list()
    expect(groups).toEqual([])
    expect(items).toEqual([expect.objectContaining({ stockId: '2330', groupId: null })])
  })
})

describe('使用者隔離', () => {
  it('B 看不到、改不到 A 的分組與自選股，也不能把股票放進 A 的分組', async () => {
    const g = await createGroup('A 的分組')
    await add('2330', { groupId: g.id })

    expect(await list(bob.cookie)).toEqual({ groups: [], items: [] })
    expect((await send(bob.cookie, 'PATCH', `/watchlist-groups/${g.id}`, { name: 'x' })).status).toBe(404)
    expect((await send(bob.cookie, 'DELETE', `/watchlist-groups/${g.id}`)).status).toBe(404)
    expect((await send(bob.cookie, 'PATCH', '/watchlist/2330', { note: 'x' })).status).toBe(404)
    expect((await add('2330', { groupId: g.id }, bob.cookie)).status).toBe(400)

    // B 自己加同一檔沒問題（唯一性是每人各自）
    expect((await add('2330', {}, bob.cookie)).status).toBe(201)
  })
})
