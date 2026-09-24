import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { parseAllowedEmails } from './config.js'
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
