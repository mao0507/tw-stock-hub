import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Db } from '../../db/client.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { ALERT_TYPES } from '../../db/schema/members.js'
import { createAlertsRepository, MAX_RULES_PER_USER } from './alerts.repository.js'

// 盤後提醒與站內通知（#26）。已由父層 portfolio router 掛 requireAuth；一律以 JWT sub 過濾資料

const StockId = z.string().regex(/^[0-9A-Z]{4,6}$/, '股票代號格式錯誤')
const Uuid = z.string().uuid()
const ErrorBody = z.object({ error: z.string() })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { 'application/json': { schema } }, required: true } })

const Alert = z.object({
  id: Uuid, stockId: z.string(), stockName: z.string(), alertType: z.enum(ALERT_TYPES), threshold: z.number(),
  isActive: z.boolean(), isTriggered: z.boolean(), triggeredAt: z.string().nullable(), createdAt: z.string(),
})
const Notification = z.object({
  id: Uuid, title: z.string(), body: z.string(), stockId: z.string().nullable(), readAt: z.string().nullable(), createdAt: z.string(),
})

const routes = {
  list: createRoute({ method: 'get', path: '/alerts', responses: { 200: json(z.array(Alert), '提醒規則（新到舊）') } }),
  create: createRoute({
    method: 'post',
    path: '/alerts',
    request: body(z.object({
      stockId: StockId,
      alertType: z.enum(ALERT_TYPES),
      threshold: z.number().positive('門檻須大於 0').max(1e9).describe('價格（元）、漲跌幅（%）或成交量（張）'),
    })),
    responses: {
      201: json(Alert, '已建立'),
      404: json(ErrorBody, '查無股票'),
      409: json(ErrorBody, `規則數已達上限 ${MAX_RULES_PER_USER}`),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: '/alerts/{id}',
    request: { params: z.object({ id: Uuid }) },
    responses: { 204: { description: '已刪除' }, 404: json(ErrorBody, '找不到規則') },
  }),
  reset: createRoute({
    method: 'patch',
    path: '/alerts/{id}/reset',
    request: { params: z.object({ id: Uuid }) },
    responses: { 200: json(Alert, '已重設，下次盤後會再評估'), 404: json(ErrorBody, '找不到規則') },
  }),
  notifications: createRoute({
    method: 'get',
    path: '/notifications',
    responses: { 200: json(z.object({ unreadCount: z.number(), items: z.array(Notification) }), '最近 50 則通知') },
  }),
  read: createRoute({
    method: 'post',
    path: '/notifications/read',
    request: body(z.object({ ids: z.array(Uuid).max(200).optional() }).describe('未指定 ids 則全部標為已讀')),
    responses: { 204: { description: '已標記' } },
  }),
}

export function createAlertRoutes(db: Db) {
  const app = new OpenAPIHono<AuthEnv>()
  const repo = createAlertsRepository(db)
  const uid = (c: { get: (k: 'jwtPayload') => { sub: string } }) => c.get('jwtPayload').sub

  app.openapi(routes.list, async (c) => c.json(await repo.list(uid(c)), 200))

  app.openapi(routes.create, async (c) => {
    const input = c.req.valid('json')
    const name = await repo.stockName(input.stockId)
    if (!name) return c.json({ error: `查無股票 ${input.stockId}` }, 404)
    if ((await repo.count(uid(c))) >= MAX_RULES_PER_USER) {
      return c.json({ error: `提醒規則最多 ${MAX_RULES_PER_USER} 條` }, 409)
    }
    return c.json(await repo.create(uid(c), input, name), 201)
  })

  app.openapi(routes.remove, async (c) => {
    const ok = await repo.remove(uid(c), c.req.valid('param').id)
    return ok ? c.body(null, 204) : c.json({ error: '找不到規則' }, 404)
  })

  app.openapi(routes.reset, async (c) => {
    const r = await repo.reset(uid(c), c.req.valid('param').id)
    return r ? c.json(r, 200) : c.json({ error: '找不到規則' }, 404)
  })

  app.openapi(routes.notifications, async (c) => c.json(await repo.notifications(uid(c)), 200))

  app.openapi(routes.read, async (c) => {
    await repo.markRead(uid(c), c.req.valid('json').ids)
    return c.body(null, 204)
  })

  return app
}
