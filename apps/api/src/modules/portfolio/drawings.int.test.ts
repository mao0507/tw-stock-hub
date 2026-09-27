// #37 K 線畫線：每位使用者每檔股票各自保存
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createTestUser, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

type Drawing = { id: string; stockId: string; kind: 'hline' | 'trend'; points: { time: string; price: number }[] }

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '2317', '鴻海')
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/portfolio${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
async function create(body: object, cookie = alice.cookie): Promise<Drawing> {
  const res = await send(cookie, 'POST', '/drawings', body)
  expect(res.status).toBe(201)
  return (await res.json()) as Drawing
}
const list = async (stockId: string, cookie = alice.cookie) =>
  (await (await send(cookie, 'GET', `/drawings?stockId=${stockId}`)).json()) as Drawing[]

const hline = { stockId: '2330', kind: 'hline', points: [{ time: '2026-09-24', price: 1000 }] }
const trend = { stockId: '2330', kind: 'trend', points: [{ time: '2026-08-01', price: 900 }, { time: '2026-09-01', price: 950.5 }] }

describe('畫線 CRUD', () => {
  it('新增水平線與趨勢線，依股票列出；只看得到自己的', async () => {
    const h = await create(hline)
    const tr = await create(trend)
    await create({ ...hline, stockId: '2317' })
    expect(h).toMatchObject(hline)
    expect((await list('2330')).map((d) => d.id)).toEqual([h.id, tr.id])
    expect(await list('2330', bob.cookie)).toEqual([])
  })

  it('拖曳後更新點位；別人的 404', async () => {
    const h = await create(hline)
    const moved = [{ time: '2026-09-24', price: 1010 }]
    expect((await send(bob.cookie, 'PATCH', `/drawings/${h.id}`, { points: moved })).status).toBe(404)
    const res = await send(alice.cookie, 'PATCH', `/drawings/${h.id}`, { points: moved })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Drawing).points).toEqual(moved)
    // 點數需符合種類
    expect((await send(alice.cookie, 'PATCH', `/drawings/${h.id}`, { points: trend.points })).status).toBe(400)
  })

  it('刪除自己的；別人的 404', async () => {
    const h = await create(hline)
    expect((await send(bob.cookie, 'DELETE', `/drawings/${h.id}`)).status).toBe(404)
    expect((await send(alice.cookie, 'DELETE', `/drawings/${h.id}`)).status).toBe(204)
    expect((await list('2330')).map((d) => d.id)).not.toContain(h.id)
  })

  it('驗證：點數與種類不符、價格或日期不合法、未知股票 400/404、未登入 401', async () => {
    expect((await send(alice.cookie, 'POST', '/drawings', { ...hline, points: trend.points })).status).toBe(400)
    expect((await send(alice.cookie, 'POST', '/drawings', { ...trend, points: [trend.points[0]] })).status).toBe(400)
    expect((await send(alice.cookie, 'POST', '/drawings', { ...hline, points: [{ time: '2026-09-24', price: -1 }] })).status).toBe(400)
    expect((await send(alice.cookie, 'POST', '/drawings', { ...hline, points: [{ time: 'x', price: 1 }] })).status).toBe(400)
    expect((await send(alice.cookie, 'POST', '/drawings', { ...hline, kind: 'circle' })).status).toBe(400)
    expect((await send(alice.cookie, 'POST', '/drawings', { ...hline, stockId: '9999' })).status).toBe(404)
    expect((await app.request('/api/portfolio/drawings?stockId=2330')).status).toBe(401)
  })
})
