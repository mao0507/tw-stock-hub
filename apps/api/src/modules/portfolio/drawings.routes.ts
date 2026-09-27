import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { chartDrawings } from '../../db/schema/members.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { createAlertsRepository } from './alerts.repository.js'

// K 線畫線（#37）：水平線 1 點、趨勢線 2 點。已由父層 portfolio router 掛 requireAuth

export const MAX_DRAWINGS_PER_STOCK = 50
const POINTS_BY_KIND = { hline: 1, trend: 2 } as const

const StockId = z.string().regex(/^[0-9A-Z]{4,6}$/, '股票代號格式錯誤')
const Uuid = z.string().uuid()
const Kind = z.enum(['hline', 'trend'])
const Point = z.object({
  time: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD'),
  price: z.number().positive().max(1e7),
}).strict()
const Points = z.array(Point).min(1).max(2)
const ErrorBody = z.object({ error: z.string() })
const Drawing = z.object({ id: Uuid, stockId: z.string(), kind: Kind, points: Points })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { 'application/json': { schema } }, required: true } })

const routes = {
  list: createRoute({
    method: 'get',
    path: '/drawings',
    request: { query: z.object({ stockId: StockId }) },
    responses: { 200: json(z.array(Drawing), '該股的畫線（依建立順序）') },
  }),
  create: createRoute({
    method: 'post',
    path: '/drawings',
    request: body(z.object({ stockId: StockId, kind: Kind, points: Points })
      .refine((d) => d.points.length === POINTS_BY_KIND[d.kind], { message: '水平線 1 點、趨勢線 2 點', path: ['points'] })),
    responses: {
      201: json(Drawing, '已建立'),
      404: json(ErrorBody, '查無股票'),
      409: json(ErrorBody, `每檔最多 ${MAX_DRAWINGS_PER_STOCK} 條`),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: '/drawings/{id}',
    request: { params: z.object({ id: Uuid }), ...body(z.object({ points: Points })) },
    responses: { 200: json(Drawing, '已更新'), 400: json(ErrorBody, '點數與種類不符'), 404: json(ErrorBody, '找不到畫線') },
  }),
  remove: createRoute({
    method: 'delete',
    path: '/drawings/{id}',
    request: { params: z.object({ id: Uuid }) },
    responses: { 204: { description: '已刪除' }, 404: json(ErrorBody, '找不到畫線') },
  }),
}

const toItem = (r: typeof chartDrawings.$inferSelect) => ({
  id: r.id, stockId: r.stockId, kind: r.kind as z.infer<typeof Kind>, points: r.points,
})

export function createDrawingRoutes(db: Db) {
  const app = new OpenAPIHono<AuthEnv>()
  const alerts = createAlertsRepository(db)
  const uid = (c: { get: (k: 'jwtPayload') => { sub: string } }) => c.get('jwtPayload').sub
  const mine = (userId: string, id: string) => and(eq(chartDrawings.id, id), eq(chartDrawings.userId, userId))

  app.openapi(routes.list, async (c) => {
    const rows = await db.select().from(chartDrawings)
      .where(and(eq(chartDrawings.userId, uid(c)), eq(chartDrawings.stockId, c.req.valid('query').stockId)))
      .orderBy(asc(chartDrawings.createdAt), asc(chartDrawings.id))
    return c.json(rows.map(toItem), 200)
  })

  app.openapi(routes.create, async (c) => {
    const input = c.req.valid('json')
    const userId = uid(c)
    if (!(await alerts.stockName(input.stockId))) return c.json({ error: `查無股票 ${input.stockId}` }, 404)
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`drawings:${userId}:${input.stockId}`}))`)
      const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(chartDrawings)
        .where(and(eq(chartDrawings.userId, userId), eq(chartDrawings.stockId, input.stockId)))
      if ((cnt?.n ?? 0) >= MAX_DRAWINGS_PER_STOCK) return null
      const [row] = await tx.insert(chartDrawings).values({ userId, ...input }).returning()
      return row!
    })
    return r ? c.json(toItem(r), 201) : c.json({ error: `每檔最多 ${MAX_DRAWINGS_PER_STOCK} 條` }, 409)
  })

  app.openapi(routes.update, async (c) => {
    const { id } = c.req.valid('param')
    const { points } = c.req.valid('json')
    const [cur] = await db.select({ kind: chartDrawings.kind }).from(chartDrawings).where(mine(uid(c), id))
    if (!cur) return c.json({ error: '找不到畫線' }, 404)
    if (points.length !== POINTS_BY_KIND[cur.kind as keyof typeof POINTS_BY_KIND]) {
      return c.json({ error: '水平線 1 點、趨勢線 2 點' }, 400)
    }
    const [r] = await db.update(chartDrawings).set({ points, updatedAt: new Date() }).where(mine(uid(c), id)).returning()
    return r ? c.json(toItem(r), 200) : c.json({ error: '找不到畫線' }, 404)
  })

  app.openapi(routes.remove, async (c) => {
    const rows = await db.delete(chartDrawings).where(mine(uid(c), c.req.valid('param').id)).returning({ id: chartDrawings.id })
    return rows.length ? c.body(null, 204) : c.json({ error: '找不到畫線' }, 404)
  })

  return app
}
