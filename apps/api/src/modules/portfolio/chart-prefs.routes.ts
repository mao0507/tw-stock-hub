import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { chartPreferences } from '../../db/schema/members.js'
import type { AuthEnv } from '../../middleware/auth.js'

// 圖表偏好（#36）：技術指標參數。範圍需與 packages/charts 的 INDICATOR_PARAM_SPECS 一致。
// 已由父層 portfolio router 掛 requireAuth

const int = (min: number, max: number) => z.number().int().min(min).max(max)
const IndicatorParams = z.object({
  kd: z.object({ period: int(3, 60) }).strict(),
  macd: z.object({ fast: int(2, 60), slow: int(3, 120), signal: int(2, 60) }).strict()
    .refine((m) => m.fast < m.slow, { message: '快線需小於慢線' }),
  rsi: z.object({ period: int(2, 60) }).strict(),
  boll: z.object({ period: int(5, 120), stdDev: z.number().min(0.5).max(4) }).strict(),
  atr: z.object({ period: int(2, 60) }).strict(),
  wr: z.object({ period: int(2, 60) }).strict(),
  bias: z.object({ period: int(2, 120) }).strict(),
  dmi: z.object({ period: int(2, 60) }).strict(),
}).partial().strict()

const Prefs = z.object({ indicatorParams: IndicatorParams.nullable() })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const routes = {
  get: createRoute({
    method: 'get', path: '/chart-preferences', responses: { 200: json(Prefs, '圖表偏好（未設定為 null）') },
  }),
  put: createRoute({
    method: 'put',
    path: '/chart-preferences',
    request: { body: { content: { 'application/json': { schema: z.object({ indicatorParams: IndicatorParams }) } }, required: true } },
    responses: { 200: json(Prefs, '已儲存') },
  }),
  reset: createRoute({
    method: 'delete', path: '/chart-preferences', responses: { 204: { description: '已還原預設' } },
  }),
}

export function createChartPrefsRoutes(db: Db) {
  const app = new OpenAPIHono<AuthEnv>()
  const uid = (c: { get: (k: 'jwtPayload') => { sub: string } }) => c.get('jwtPayload').sub

  app.openapi(routes.get, async (c) => {
    const [r] = await db.select({ p: chartPreferences.indicatorParams }).from(chartPreferences)
      .where(eq(chartPreferences.userId, uid(c)))
    return c.json({ indicatorParams: r?.p ?? null }, 200)
  })

  app.openapi(routes.put, async (c) => {
    const { indicatorParams } = c.req.valid('json')
    await db.insert(chartPreferences).values({ userId: uid(c), indicatorParams })
      .onConflictDoUpdate({ target: chartPreferences.userId, set: { indicatorParams, updatedAt: new Date() } })
    return c.json({ indicatorParams }, 200)
  })

  app.openapi(routes.reset, async (c) => {
    await db.delete(chartPreferences).where(eq(chartPreferences.userId, uid(c)))
    return c.body(null, 204)
  })

  return app
}
