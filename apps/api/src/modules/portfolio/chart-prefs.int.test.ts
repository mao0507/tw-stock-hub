// #36 圖表偏好：指標參數存在帳號，跨裝置同步
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createTestUser, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

const send = (cookie: string, method: string, body?: unknown) =>
  app.request('/api/portfolio/chart-preferences', {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const get = async (cookie = alice.cookie) => (await (await send(cookie, 'GET')).json()) as { indicatorParams: unknown }

describe('圖表偏好', () => {
  it('未設定回 null；儲存後讀回，只影響自己', async () => {
    expect(await get()).toEqual({ indicatorParams: null })
    const params = { kd: { period: 5 }, macd: { fast: 8, slow: 21, signal: 5 }, dmi: { period: 10 } }
    const res = await send(alice.cookie, 'PUT', { indicatorParams: params })
    expect(res.status).toBe(200)
    expect(await get()).toEqual({ indicatorParams: params })
    expect(await get(bob.cookie)).toEqual({ indicatorParams: null })
  })

  it('再次儲存覆蓋；還原預設刪除設定', async () => {
    await send(alice.cookie, 'PUT', { indicatorParams: { rsi: { period: 9 } } })
    expect(await get()).toEqual({ indicatorParams: { rsi: { period: 9 } } })
    expect((await send(alice.cookie, 'DELETE')).status).toBe(204)
    expect(await get()).toEqual({ indicatorParams: null })
  })

  it('驗證：超出範圍、未知指標或參數 400；MACD 快線需小於慢線；未登入 401', async () => {
    expect((await send(alice.cookie, 'PUT', { indicatorParams: { kd: { period: 0 } } })).status).toBe(400)
    expect((await send(alice.cookie, 'PUT', { indicatorParams: { nope: { period: 5 } } })).status).toBe(400)
    expect((await send(alice.cookie, 'PUT', { indicatorParams: { kd: { period: 5, x: 1 } } })).status).toBe(400)
    expect((await send(alice.cookie, 'PUT', { indicatorParams: { macd: { fast: 30, slow: 20, signal: 9 } } })).status).toBe(400)
    expect((await app.request('/api/portfolio/chart-preferences')).status).toBe(401)
  })
})
