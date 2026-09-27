import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, between, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { technicalSignals as ts } from '../../db/schema/stocks.js'
import { CalendarDate, cached, ErrorBody, findActiveStock, IdParam, json, NOT_FOUND, notFoundBody } from './shared.js'

// 技術訊號（#29）：crawler 盤後偵測，這裡只讀。訊號代碼與中文名稱見前端 SIGNAL_META

const DEFAULT_DAYS = 90
const MAX_RANGE_DAYS = 366 * 3
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const span = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000

export const SignalItem = z.object({
  date: z.string(),
  signal: z.string(),
  side: z.enum(['bull', 'bear']),
  values: z.record(z.string(), z.number()),
})

const route = createRoute({
  method: 'get',
  path: '/stocks/{id}/signals',
  request: {
    params: IdParam,
    query: z
      .object({ from: CalendarDate.optional(), to: CalendarDate.optional() })
      .refine((q) => !q.from || !q.to || q.from <= q.to, 'from 不可晚於 to')
      .refine((q) => !q.from || !q.to || span(q.from, q.to) <= MAX_RANGE_DAYS, '查詢區間最多 3 年'),
  },
  responses: {
    200: json(z.array(SignalItem), `個股訊號（新到舊；未指定區間時為最新訊號日往回 ${DEFAULT_DAYS} 天）`),
    400: json(ErrorBody, '參數錯誤'),
    404: json(ErrorBody, '查無股票'),
  },
})

export function registerSignalRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(route, async (c) => {
    const { id } = c.req.valid('param')
    const q = c.req.valid('query')
    const r = await cached(`signals:${id}:${q.from ?? ''}:${q.to ?? ''}`, async () => {
      if (!(await findActiveStock(db, id))) return NOT_FOUND
      let to = q.to
      if (!to) {
        const [latest] = await db.select({ d: sql<string | null>`MAX(${ts.date})::text` }).from(ts).where(eq(ts.stockId, id))
        if (!latest?.d) return { data: [] }
        to = latest.d
      }
      const from = q.from ?? shift(to, -DEFAULT_DAYS)
      const rows = await db
        .select({ date: ts.date, signal: ts.signal, side: ts.side, values: ts.values })
        .from(ts)
        .where(and(eq(ts.stockId, id), between(ts.date, from, to)))
        .orderBy(desc(ts.date), asc(ts.signal))
      return {
        data: rows.map((x) => ({
          date: x.date, signal: x.signal, side: x.side as 'bull' | 'bear', values: x.values as Record<string, number>,
        })),
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })
}
