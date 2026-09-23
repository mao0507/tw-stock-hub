import { sign } from 'hono/jwt'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { type Config, parseAllowedEmails } from './config.js'
import type { Db } from './db/client.js'
import { isAllowed } from './modules/auth/index.js'

const config: Config = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'postgres://unused',
  jwtSecret: 'x'.repeat(32),
  jwtTtlDays: 7,
  google: { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/api/auth/google' },
  allowedEmails: parseAllowedEmails(' Me@Example.com , friend@example.com,'),
  webOrigin: 'http://localhost:8080',
  adminApiKey: 'k'.repeat(16),
}

const app = createApp({
  config,
  db: {} as Db,
  upsertUser: async () => ({ id: 'u1' }),
  ping: async () => {},
})

describe('allowlist', () => {
  it('忽略大小寫與空白，拒絕名單外與缺值', () => {
    expect(isAllowed('me@example.com', config.allowedEmails)).toBe(true)
    expect(isAllowed(' FRIEND@example.com', config.allowedEmails)).toBe(true)
    expect(isAllowed('stranger@example.com', config.allowedEmails)).toBe(false)
    expect(isAllowed(undefined, config.allowedEmails)).toBe(false)
    expect(config.allowedEmails.has('')).toBe(false)
  })
})

describe('GET /api/auth/me', () => {
  it('沒有 cookie 回 401', async () => {
    const res = await app.request('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('有效 cookie 回傳使用者', async () => {
    const token = await sign(
      { sub: 'u1', email: 'me@example.com', name: 'Me', exp: Math.floor(Date.now() / 1000) + 60 },
      config.jwtSecret,
      'HS256',
    )
    const res = await app.request('/api/auth/me', { headers: { Cookie: `token=${token}` } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'u1', email: 'me@example.com', name: 'Me' })
  })

  it('錯誤 secret 簽的 token 回 401', async () => {
    const token = await sign({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 60 }, 'y'.repeat(32), 'HS256')
    const res = await app.request('/api/auth/me', { headers: { Cookie: `token=${token}` } })
    expect(res.status).toBe(401)
  })
})

describe('admin', () => {
  it('缺 X-Admin-Key 回 401', async () => {
    const res = await app.request('/api/admin/jobs')
    expect(res.status).toBe(401)
  })
})
