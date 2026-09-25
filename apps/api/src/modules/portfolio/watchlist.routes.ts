import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Db } from '../../db/client.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { createWatchlistRepository } from './watchlist.repository.js'

// 已由父層 portfolio router 掛 requireAuth；一律以 JWT sub 過濾資料

const StockId = z.string().regex(/^[0-9A-Z]{4,6}$/, '股票代號格式錯誤')
const Uuid = z.string().uuid()
const SortOrder = z.number().int().min(-1_000_000).max(1_000_000)
const Note = z.string().trim().max(200).nullable()
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, '顏色須為 #RRGGBB')
const GroupName = z.string().trim().min(1, '分組名稱不可空白').max(30)

const Group = z.object({ id: Uuid, name: z.string(), color: z.string().nullable(), sortOrder: z.number() })
const Item = z.object({
  id: Uuid,
  stockId: z.string(),
  name: z.string(),
  groupId: z.string().nullable(),
  note: z.string().nullable(),
  sortOrder: z.number(),
  addedAt: z.string(),
  close: z.number().nullable(),
  change: z.number().nullable(),
  changePct: z.number().nullable(),
  priceDate: z.string().nullable(),
})
const ErrorBody = z.object({ error: z.string() })

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { 'application/json': { schema } }, required: true } })
const nonEmpty = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).partial().refine((v) => Object.keys(v).length > 0, '至少修改一個欄位')

const routes = {
  list: createRoute({
    method: 'get',
    path: '/watchlist',
    responses: { 200: json(z.object({ groups: z.array(Group), items: z.array(Item) }), '分組與自選股') },
  }),
  add: createRoute({
    method: 'post',
    path: '/watchlist',
    request: body(z.object({ stockId: StockId, groupId: Uuid.nullable().optional(), note: Note.optional() })),
    responses: {
      201: json(z.object({ id: Uuid }), '已加入'),
      400: json(ErrorBody, '股票或分組不存在'),
      409: json(ErrorBody, '已在自選股中'),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: '/watchlist/{stockId}',
    request: {
      params: z.object({ stockId: StockId }),
      ...body(nonEmpty({ note: Note, groupId: Uuid.nullable(), sortOrder: SortOrder })),
    },
    responses: { 200: json(z.object({ ok: z.boolean() }), '已更新'), 404: json(ErrorBody, '不在自選股中') },
  }),
  remove: createRoute({
    method: 'delete',
    path: '/watchlist/{stockId}',
    request: { params: z.object({ stockId: StockId }) },
    responses: { 204: { description: '已移除' }, 404: json(ErrorBody, '不在自選股中') },
  }),
  reorderItems: createRoute({
    method: 'put',
    path: '/watchlist/order',
    request: body(z.object({ groupId: Uuid.nullable(), stockIds: z.array(StockId).max(500) })),
    responses: { 204: { description: '已更新順序' }, 400: json(ErrorBody, '清單與分組內容不符') },
  }),
  reorderGroups: createRoute({
    method: 'put',
    path: '/watchlist-groups/order',
    request: body(z.object({ ids: z.array(Uuid).max(100) })),
    responses: { 204: { description: '已更新順序' }, 400: json(ErrorBody, '清單與分組不符') },
  }),
  createGroup: createRoute({
    method: 'post',
    path: '/watchlist-groups',
    request: body(z.object({ name: GroupName, color: Color.nullable().optional() })),
    responses: { 201: json(Group, '已建立') },
  }),
  updateGroup: createRoute({
    method: 'patch',
    path: '/watchlist-groups/{id}',
    request: {
      params: z.object({ id: Uuid }),
      ...body(nonEmpty({ name: GroupName, color: Color.nullable(), sortOrder: SortOrder })),
    },
    responses: { 200: json(Group, '已更新'), 404: json(ErrorBody, '找不到分組') },
  }),
  deleteGroup: createRoute({
    method: 'delete',
    path: '/watchlist-groups/{id}',
    request: { params: z.object({ id: Uuid }) },
    responses: { 204: { description: '已刪除，組內股票改為未分組' }, 404: json(ErrorBody, '找不到分組') },
  }),
}

export function createWatchlistRoutes(db: Db) {
  const app = new OpenAPIHono<AuthEnv>()
  const repo = createWatchlistRepository(db)
  const uid = (c: { get: (k: 'jwtPayload') => { sub: string } }) => c.get('jwtPayload').sub

  app.openapi(routes.list, async (c) => c.json(await repo.list(uid(c)), 200))

  app.openapi(routes.add, async (c) => c.json(await repo.add(uid(c), c.req.valid('json')), 201))

  app.openapi(routes.update, async (c) => {
    const ok = await repo.update(uid(c), c.req.valid('param').stockId, c.req.valid('json'))
    return ok ? c.json({ ok }, 200) : c.json({ error: '不在自選股中' }, 404)
  })

  app.openapi(routes.remove, async (c) => {
    const ok = await repo.remove(uid(c), c.req.valid('param').stockId)
    return ok ? c.body(null, 204) : c.json({ error: '不在自選股中' }, 404)
  })

  app.openapi(routes.reorderItems, async (c) => {
    const { groupId, stockIds } = c.req.valid('json')
    await repo.reorderItems(uid(c), groupId, stockIds)
    return c.body(null, 204)
  })

  app.openapi(routes.reorderGroups, async (c) => {
    await repo.reorderGroups(uid(c), c.req.valid('json').ids)
    return c.body(null, 204)
  })

  app.openapi(routes.createGroup, async (c) => c.json(await repo.createGroup(uid(c), c.req.valid('json')), 201))

  app.openapi(routes.updateGroup, async (c) => {
    const g = await repo.updateGroup(uid(c), c.req.valid('param').id, c.req.valid('json'))
    return g ? c.json(g, 200) : c.json({ error: '找不到分組' }, 404)
  })

  app.openapi(routes.deleteGroup, async (c) => {
    const ok = await repo.deleteGroup(uid(c), c.req.valid('param').id)
    return ok ? c.body(null, 204) : c.json({ error: '找不到分組' }, 404)
  })

  return app
}
