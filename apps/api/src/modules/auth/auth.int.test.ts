import type { MiddlewareHandler } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { authCookie, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

type FakeGoogleUser = { id?: string; email?: string; verified_email?: boolean; name?: string; picture?: string }

let t: TestDb
let googleUser: FakeGoogleUser = {}

// 取代真 Google：直接把「Google 回傳的使用者」放進 context
const fakeGoogle: MiddlewareHandler = async (c, next) => {
  c.set('user-google', googleUser)
  await next()
}

let app: ReturnType<typeof createApp>

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {}, googleOAuth: fakeGoogle })
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

function tokenFrom(res: Response): string {
  const cookie = res.headers.get('set-cookie') ?? ''
  const m = /token=([^;]+)/.exec(cookie)
  if (!m) throw new Error(`no token cookie: ${cookie}`)
  return `token=${m[1]}`
}

async function login(user: FakeGoogleUser, query = '') {
  googleUser = user
  return app.request(`/api/auth/google${query}`)
}

const me = { id: 'g-1', email: 'Me@Example.com', verified_email: true, name: '我', picture: 'https://img/me.png' }

describe('Google 登入 callback', () => {
  it('邀請名單內：寫入使用者、發 httpOnly cookie、導回首頁', async () => {
    const res = await login(me)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(testConfig.webOrigin)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=Lax/i)

    const body = await (await app.request('/api/auth/me', { headers: { Cookie: tokenFrom(res) } })).json()
    expect(body).toMatchObject({ email: 'me@example.com', nickname: '我', avatarUrl: 'https://img/me.png' })
  })

  it('每次登入都更新 last_login_at', async () => {
    await login(me)
    const [before] = await t.admin`SELECT last_login_at FROM members.users WHERE google_id = 'g-1'`
    await new Promise((r) => setTimeout(r, 20))
    await login(me)
    const [after] = await t.admin`SELECT last_login_at FROM members.users WHERE google_id = 'g-1'`
    expect(before!.last_login_at).toBeInstanceOf(Date)
    expect(after!.last_login_at.getTime()).toBeGreaterThan(before!.last_login_at.getTime())
  })

  it('不在邀請名單：導回登入頁並帶 not_invited，不發 cookie、不建使用者', async () => {
    const res = await login({ ...me, id: 'g-x', email: 'stranger@example.com' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${testConfig.webOrigin}/login?error=not_invited`)
    expect(res.headers.get('set-cookie')).toBeNull()
    const rows = await t.admin`SELECT 1 FROM members.users WHERE google_id = 'g-x'`
    expect(rows).toHaveLength(0)
  })

  it('email 未驗證視同不在名單', async () => {
    const res = await login({ ...me, id: 'g-y', verified_email: false })
    expect(res.headers.get('location')).toBe(`${testConfig.webOrigin}/login?error=not_invited`)
  })
})

describe('登入後導回原本頁面', () => {
  it('帶站內路徑 redirect：登入後導回該頁', async () => {
    const res = await login(me, '?redirect=%2Fwatchlist%3Ftab%3D1')
    expect(res.headers.get('location')).toBe(`${testConfig.webOrigin}/watchlist?tab=1`)
  })

  it('Google 回呼（query 已不在）時從 cookie 取回導向目標，並清掉該 cookie', async () => {
    googleUser = me
    const res = await app.request('/api/auth/google?code=x', { headers: { Cookie: 'login_redirect=/portfolio' } })
    expect(res.headers.get('location')).toBe(`${testConfig.webOrigin}/portfolio`)
    expect(res.headers.get('set-cookie')).toMatch(/login_redirect=;.*Max-Age=0/i)
  })

  it('被竄改的 cookie 導向目標一樣會被擋', async () => {
    googleUser = me
    const res = await app.request('/api/auth/google?code=x', { headers: { Cookie: 'login_redirect=//evil.com' } })
    expect(res.headers.get('location')).toBe(testConfig.webOrigin)
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', '/foo bar', 'watchlist'])(
    '非站內路徑 %s：忽略，導回首頁（防 open redirect）',
    async (target) => {
      const res = await login(me, `?redirect=${encodeURIComponent(target)}`)
      expect(res.headers.get('location')).toBe(testConfig.webOrigin)
    },
  )
})

describe('GET /api/auth/me', () => {
  it('沒有 cookie 回 401', async () => {
    expect((await app.request('/api/auth/me')).status).toBe(401)
  })

  it('過期 cookie 回 401', async () => {
    const cookie = await authCookie({ exp: Math.floor(Date.now() / 1000) - 10 })
    expect((await app.request('/api/auth/me', { headers: { Cookie: cookie } })).status).toBe(401)
  })

  it('錯誤簽章回 401', async () => {
    const cookie = await authCookie({}, 'y'.repeat(32))
    expect((await app.request('/api/auth/me', { headers: { Cookie: cookie } })).status).toBe(401)
  })

  it('token 有效但使用者已不存在回 401', async () => {
    const cookie = await authCookie({ sub: '00000000-0000-0000-0000-00000000dead' })
    expect((await app.request('/api/auth/me', { headers: { Cookie: cookie } })).status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('清除 cookie', async () => {
    const res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Origin: testConfig.webOrigin },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toMatch(/token=;.*Max-Age=0/i)
  })
})
