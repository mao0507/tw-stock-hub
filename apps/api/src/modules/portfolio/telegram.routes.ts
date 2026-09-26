import { randomBytes } from 'node:crypto'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema/members.js'
import type { Telegram } from '../../lib/telegram.js'
import type { AuthEnv } from '../../middleware/auth.js'

// Telegram 綁定（#27）。已由父層 portfolio router 掛 requireAuth
// 流程：POST /telegram/link 取得綁定碼與 bot 連結 → 使用者傳 /start <碼> → POST /telegram/link/confirm

const LINK_TTL_MIN = 10
const ErrorBody = z.object({ error: z.string() })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const routes = {
  status: createRoute({
    method: 'get',
    path: '/telegram',
    responses: {
      200: json(z.object({ enabled: z.boolean(), linked: z.boolean(), botUsername: z.string().nullable() }), '綁定狀態'),
    },
  }),
  link: createRoute({
    method: 'post',
    path: '/telegram/link',
    responses: {
      200: json(z.object({ code: z.string(), url: z.string(), expiresInMinutes: z.number() }), '綁定碼與 bot 連結'),
      503: json(ErrorBody, '伺服器未設定 Telegram bot'),
    },
  }),
  confirm: createRoute({
    method: 'post',
    path: '/telegram/link/confirm',
    responses: {
      200: json(z.object({ linked: z.literal(true) }), '已綁定'),
      409: json(ErrorBody, '還沒收到 /start 綁定碼'),
      410: json(ErrorBody, '綁定碼不存在或已過期'),
      503: json(ErrorBody, '伺服器未設定 Telegram bot'),
    },
  }),
  unlink: createRoute({
    method: 'delete',
    path: '/telegram',
    responses: { 204: { description: '已解除綁定' } },
  }),
}

// 去掉易混淆的 0/O、1/I
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('')

export function createTelegramRoutes(db: Db, tg: Telegram) {
  const app = new OpenAPIHono<AuthEnv>()
  const uid = (c: { get: (k: 'jwtPayload') => { sub: string } }) => c.get('jwtPayload').sub
  const disabled = { error: '伺服器未設定 Telegram bot（TELEGRAM_BOT_TOKEN）' }

  app.openapi(routes.status, async (c) => {
    const [u] = await db.select({ chatId: users.telegramChatId }).from(users).where(eq(users.id, uid(c)))
    return c.json({ enabled: tg.enabled, linked: !!u?.chatId, botUsername: tg.botUsername }, 200)
  })

  app.openapi(routes.link, async (c) => {
    if (!tg.enabled || !tg.botUsername) return c.json(disabled, 503)
    const code = newCode()
    await db.update(users).set({
      telegramLinkCode: code,
      telegramLinkExpiresAt: new Date(Date.now() + LINK_TTL_MIN * 60_000),
    }).where(eq(users.id, uid(c)))
    return c.json({ code, url: `https://t.me/${tg.botUsername}?start=${code}`, expiresInMinutes: LINK_TTL_MIN }, 200)
  })

  app.openapi(routes.confirm, async (c) => {
    if (!tg.enabled) return c.json(disabled, 503)
    const [u] = await db.select({ code: users.telegramLinkCode }).from(users)
      .where(and(eq(users.id, uid(c)), gt(users.telegramLinkExpiresAt, new Date())))
    if (!u?.code) return c.json({ error: '綁定碼不存在或已過期，請重新產生' }, 410)
    const chatId = await tg.findStartChat(u.code)
    if (!chatId) return c.json({ error: '還沒收到綁定訊息，請先在 Telegram 對 bot 按「開始」' }, 409)
    await db.update(users).set({ telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpiresAt: null })
      .where(eq(users.id, uid(c)))
    return c.json({ linked: true as const }, 200)
  })

  app.openapi(routes.unlink, async (c) => {
    await db.update(users).set({ telegramChatId: null }).where(eq(users.id, uid(c)))
    return c.body(null, 204)
  })

  return app
}
