// #27 Telegram 通知通道
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import type { Telegram } from '../../lib/telegram.js'
import { createTestUser, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'
import { evaluateAlerts } from './index.js'

let t: TestDb
let alice: { id: string; cookie: string }
let bob: { id: string; cookie: string }

/** 假 Telegram：記錄送出的訊息；startCodes 模擬使用者對 bot 傳過的 /start 碼 */
function fakeTelegram(opts: { enabled?: boolean; failSend?: boolean } = {}) {
  const sent: { chatId: string; text: string }[] = []
  const startCodes = new Map<string, string>()
  const tg: Telegram = {
    enabled: opts.enabled ?? true,
    botUsername: opts.enabled === false ? null : 'tw_stock_hub_bot',
    async send(chatId, text) {
      if (opts.failSend) throw new Error('telegram down')
      sent.push({ chatId, text })
    },
    async findStartChat(code) {
      return startCodes.get(code) ?? null
    },
  }
  return { tg, sent, startCodes }
}

const appWith = (tg: Telegram) => createApp({ config: testConfig, db: t.api.db, ping: async () => {}, telegram: tg })
const send = (app: ReturnType<typeof appWith>, cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/portfolio${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: testConfig.webOrigin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeAll(async () => {
  t = await startTestDb()
  await seedStock(t.admin, '2330', '台積電')
  await t.admin`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct)
    VALUES ('2026-09-24', '2330', 108, 111, 107, 110, 3000000, 1, 2.68, 2.5)`
  alice = await createTestUser(t.admin, 'alice@example.com')
  bob = await createTestUser(t.admin, 'bob@example.com')
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

beforeEach(async () => {
  await t.admin`DELETE FROM members.notifications`
  await t.admin`DELETE FROM members.alert_rules`
  await t.admin`UPDATE members.users SET telegram_chat_id = NULL, telegram_link_code = NULL, telegram_link_expires_at = NULL`
})

describe('Telegram 綁定', () => {
  it('未設定 bot token 時回報停用，無法產生綁定碼', async () => {
    const app = appWith(fakeTelegram({ enabled: false }).tg)
    expect(await (await send(app, alice.cookie, 'GET', '/telegram')).json()).toEqual({ enabled: false, linked: false, botUsername: null })
    expect((await send(app, alice.cookie, 'POST', '/telegram/link')).status).toBe(503)
  })

  it('產生綁定碼 → 尚未傳給 bot 時確認失敗 → 傳送後確認成功 → 解除綁定', async () => {
    const { tg, startCodes } = fakeTelegram()
    const app = appWith(tg)
    const link = (await (await send(app, alice.cookie, 'POST', '/telegram/link')).json()) as { code: string; url: string }
    expect(link.code).toMatch(/^[A-Z0-9]{8}$/)
    expect(link.url).toBe(`https://t.me/tw_stock_hub_bot?start=${link.code}`)

    expect((await send(app, alice.cookie, 'POST', '/telegram/link/confirm')).status).toBe(409)
    startCodes.set(link.code, '123456')
    expect((await send(app, alice.cookie, 'POST', '/telegram/link/confirm')).status).toBe(200)
    expect(await (await send(app, alice.cookie, 'GET', '/telegram')).json())
      .toEqual({ enabled: true, linked: true, botUsername: 'tw_stock_hub_bot' })

    expect((await send(app, alice.cookie, 'DELETE', '/telegram')).status).toBe(204)
    expect(((await (await send(app, alice.cookie, 'GET', '/telegram')).json()) as { linked: boolean }).linked).toBe(false)
  })

  it('綁定碼過期後無法確認', async () => {
    const { tg, startCodes } = fakeTelegram()
    const app = appWith(tg)
    const { code } = (await (await send(app, alice.cookie, 'POST', '/telegram/link')).json()) as { code: string }
    startCodes.set(code, '123456')
    await t.admin`UPDATE members.users SET telegram_link_expires_at = NOW() - INTERVAL '1 minute' WHERE id = ${alice.id}`
    expect((await send(app, alice.cookie, 'POST', '/telegram/link/confirm')).status).toBe(410)
  })
})

describe('提醒推送', () => {
  it('觸發時推送給已綁定的使用者；未綁定的只有站內通知', async () => {
    const { tg, sent } = fakeTelegram()
    const app = appWith(tg)
    await t.admin`UPDATE members.users SET telegram_chat_id = '555' WHERE id = ${alice.id}`
    for (const who of [alice, bob]) {
      await send(app, who.cookie, 'POST', '/alerts', { stockId: '2330', alertType: 'price_above', threshold: 100 })
    }
    await evaluateAlerts(t.api.db, tg)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ chatId: '555' })
    expect(sent[0]!.text).toContain('台積電 2330 股價高於 100')
    const [row] = await t.admin<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM members.notifications`
    expect(row!.n).toBe(2)
  })

  it('Telegram 發送失敗不影響站內通知', async () => {
    const { tg } = fakeTelegram({ failSend: true })
    const app = appWith(tg)
    await t.admin`UPDATE members.users SET telegram_chat_id = '555' WHERE id = ${alice.id}`
    await send(app, alice.cookie, 'POST', '/alerts', { stockId: '2330', alertType: 'price_above', threshold: 100 })
    await expect(evaluateAlerts(t.api.db, tg)).resolves.toHaveLength(1)
    const [row] = await t.admin<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM members.notifications`
    expect(row!.n).toBe(1)
  })
})
