import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Db } from '../../db/client.js'
import { SIGNAL_CODES } from '../../lib/signals.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { createAlertsRepository } from './alerts.repository.js'
import { createSignalDigestsRepository, MAX_DIGESTS_PER_USER } from './signal-digests.repository.js'
import { createSignalSubsRepository, MAX_SIGNAL_SUBS_PER_USER } from './signal-subs.repository.js'

// 逐檔技術訊號訂閱（#33）與範圍訂閱每日彙整（#34）。已由父層 portfolio router 掛 requireAuth；一律以 JWT sub 過濾資料

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

const Digest = z.object({
  id: Uuid, groupId: Uuid.nullable().describe('NULL 表示全部自選股'), groupName: z.string().nullable(),
  signals: z.array(z.string()), isActive: z.boolean(), lastNotifiedDate: z.string().nullable(), createdAt: z.string(),
})
const IdParam = z.object({ id: Uuid })
const ActiveBody = z.object({ isActive: z.boolean() })

const digestRoutes = {
  list: createRoute({
    method: 'get', path: '/signal-digests', responses: { 200: json(z.array(Digest), '範圍訂閱（新到舊）') },
  }),
  create: createRoute({
    method: 'post',
    path: '/signal-digests',
    request: body(z.object({
      groupId: Uuid.nullable().default(null),
      signals: z.array(z.enum(SIGNAL_CODES)).min(1, '至少選一個訊號').max(SIGNAL_CODES.length)
        .transform((v) => [...new Set(v)]),
    })),
    responses: {
      201: json(Digest, '已建立'),
      404: json(ErrorBody, '找不到分組'),
      409: json(ErrorBody, `已達上限 ${MAX_DIGESTS_PER_USER}`),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: '/signal-digests/{id}',
    request: { params: IdParam, ...body(ActiveBody) },
    responses: { 200: json(Digest, '已更新'), 404: json(ErrorBody, '找不到訂閱') },
  }),
  remove: createRoute({
    method: 'delete',
    path: '/signal-digests/{id}',
    request: { params: IdParam },
    responses: { 204: { description: '已刪除' }, 404: json(ErrorBody, '找不到訂閱') },
  }),
}

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

  const digests = createSignalDigestsRepository(db)

  app.openapi(digestRoutes.list, async (c) => c.json(await digests.list(uid(c)), 200))

  app.openapi(digestRoutes.create, async (c) => {
    const r = await digests.create(uid(c), c.req.valid('json'))
    if (r === 'no_group') return c.json({ error: '找不到分組' }, 404)
    if (r === 'limit') return c.json({ error: `範圍訂閱最多 ${MAX_DIGESTS_PER_USER} 筆` }, 409)
    return c.json(r, 201)
  })

  app.openapi(digestRoutes.update, async (c) => {
    const r = await digests.setActive(uid(c), c.req.valid('param').id, c.req.valid('json').isActive)
    return r ? c.json(r, 200) : c.json({ error: '找不到訂閱' }, 404)
  })

  app.openapi(digestRoutes.remove, async (c) => {
    const ok = await digests.remove(uid(c), c.req.valid('param').id)
    return ok ? c.body(null, 204) : c.json({ error: '找不到訂閱' }, 404)
  })

  return app
}
