import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Db } from '../../db/client.js'
import { SIGNAL_CODES } from '../../lib/signals.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { createAlertsRepository } from './alerts.repository.js'
import { createSignalSubsRepository, MAX_SIGNAL_SUBS_PER_USER } from './signal-subs.repository.js'

// 逐檔技術訊號訂閱（#33）。已由父層 portfolio router 掛 requireAuth；一律以 JWT sub 過濾資料

const StockId = z.string().regex(/^[0-9A-Z]{4,6}$/, '股票代號格式錯誤')
const Uuid = z.string().uuid()
const ErrorBody = z.object({ error: z.string() })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { 'application/json': { schema } }, required: true } })

const Sub = z.object({
  id: Uuid, stockId: z.string(), stockName: z.string(), signal: z.string(), isActive: z.boolean(),
  lastNotifiedDate: z.string().nullable().describe('最近一次通知的交易日'), createdAt: z.string(),
})

const routes = {
  list: createRoute({
    method: 'get', path: '/signal-subscriptions', responses: { 200: json(z.array(Sub), '訊號訂閱（新到舊）') },
  }),
  create: createRoute({
    method: 'post',
    path: '/signal-subscriptions',
    request: body(z.object({ stockId: StockId, signal: z.enum(SIGNAL_CODES) })),
    responses: {
      201: json(Sub, '已訂閱'),
      404: json(ErrorBody, '查無股票'),
      409: json(ErrorBody, `已訂閱過，或已達上限 ${MAX_SIGNAL_SUBS_PER_USER}`),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: '/signal-subscriptions/{id}',
    request: { params: z.object({ id: Uuid }), ...body(z.object({ isActive: z.boolean() })) },
    responses: { 200: json(Sub, '已更新'), 404: json(ErrorBody, '找不到訂閱') },
  }),
  remove: createRoute({
    method: 'delete',
    path: '/signal-subscriptions/{id}',
    request: { params: z.object({ id: Uuid }) },
    responses: { 204: { description: '已刪除' }, 404: json(ErrorBody, '找不到訂閱') },
  }),
}

export function createSignalSubRoutes(db: Db) {
  const app = new OpenAPIHono<AuthEnv>()
  const repo = createSignalSubsRepository(db)
  const alerts = createAlertsRepository(db)
  const uid = (c: { get: (k: 'jwtPayload') => { sub: string } }) => c.get('jwtPayload').sub

  app.openapi(routes.list, async (c) => c.json(await repo.list(uid(c)), 200))

  app.openapi(routes.create, async (c) => {
    const input = c.req.valid('json')
    const name = await alerts.stockName(input.stockId)
    if (!name) return c.json({ error: `查無股票 ${input.stockId}` }, 404)
    const r = await repo.create(uid(c), input, name)
    if (r === 'limit') return c.json({ error: `訊號訂閱最多 ${MAX_SIGNAL_SUBS_PER_USER} 筆` }, 409)
    if (r === 'duplicate') return c.json({ error: '已訂閱過這檔的這個訊號' }, 409)
    return c.json(r, 201)
  })

  app.openapi(routes.update, async (c) => {
    const r = await repo.setActive(uid(c), c.req.valid('param').id, c.req.valid('json').isActive)
    return r ? c.json(r, 200) : c.json({ error: '找不到訂閱' }, 404)
  })

  app.openapi(routes.remove, async (c) => {
    const ok = await repo.remove(uid(c), c.req.valid('param').id)
    return ok ? c.body(null, 204) : c.json({ error: '找不到訂閱' }, 404)
  })

  return app
}
