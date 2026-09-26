import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadConfig, parseAllowedEmails } from './config.js'
import type { Db } from './db/client.js'
import { isAllowed } from './modules/auth/index.js'
import { testConfig } from './test/harness.js'

const config = testConfig

const app = createApp({
  config,
  db: {} as Db,
  ping: async () => {},
})

describe('allowlist', () => {
  it('忽略大小寫與空白，拒絕名單外與缺值', () => {
    expect(isAllowed('me@example.com', config.allowedEmails)).toBe(true)
    expect(isAllowed(' FRIEND@example.com', config.allowedEmails)).toBe(true)
    expect(parseAllowedEmails(' A@x.com , ,b@y.com,').size).toBe(2)
    expect(isAllowed('stranger@example.com', config.allowedEmails)).toBe(false)
    expect(isAllowed(undefined, config.allowedEmails)).toBe(false)
    expect(config.allowedEmails.has('')).toBe(false)
  })
})

describe('admin', () => {
  it('缺 X-Admin-Key 回 401', async () => {
    const res = await app.request('/api/admin/jobs')
    expect(res.status).toBe(401)
  })
})

describe('config：Telegram', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost/db', JWT_SECRET: 'x'.repeat(32),
    GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REDIRECT_URI: 'http://localhost/cb',
    ALLOWED_EMAILS: 'me@example.com', WEB_ORIGIN: 'http://localhost:8080', ADMIN_API_KEY: 'k'.repeat(16),
  }

  it('docker compose 傳入的空字串視為未設定（通道停用）', () => {
    expect(loadConfig({ ...base, TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '' }).telegram)
      .toEqual({ token: undefined, botUsername: undefined })
  })

  it('設了 token 卻沒設 bot 帳號名稱時啟動失敗', () => {
    expect(() => loadConfig({ ...base, TELEGRAM_BOT_TOKEN: '123:abc' })).toThrow(/TELEGRAM_BOT_USERNAME/)
  })
})
