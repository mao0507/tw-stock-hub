import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, gte, lte } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { exDividendCalendar as ex } from '../../db/schema/stocks.js'
import { CalendarDate, cached, ErrorBody, json, num } from './shared.js'

// 除權息行事曆（#9）

const MAX_RANGE_DAYS = 366
const days = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000

const route = createRoute({
  method: 'get',
  path: '/calendar/ex-dividend',
  request: {
    query: z
      .object({ from: CalendarDate, to: CalendarDate })
      .refine((q) => q.from <= q.to, 'from 不可晚於 to')
      .refine((q) => days(q.from, q.to) <= MAX_RANGE_DAYS, `查詢區間最多 ${MAX_RANGE_DAYS} 天`),
  },
  responses: {
    200: json(
      z.array(
        z.object({
          exDate: z.string(),
          stockId: z.string(),
          stockName: z.string().nullable(),
          cashDividend: z.number().nullable(),
          stockDividendRatio: z.number().nullable(),
        }),
      ),
      '除權息（依除息日、代號排序）',
    ),
    400: json(ErrorBody, '參數錯誤'),
  },
})

export function registerCalendarRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(route, async (c) => {
    const { from, to } = c.req.valid('query')
    const rows = await cached(`calendar:${from}:${to}`, async () => {
      const result = await db
        .select()
        .from(ex)
        .where(and(gte(ex.exDate, from), lte(ex.exDate, to)))
        .orderBy(asc(ex.exDate), asc(ex.stockId))
      return result.map((r) => ({
        exDate: r.exDate,
        stockId: r.stockId,
        stockName: r.stockName,
        cashDividend: num(r.cashDividend),
        stockDividendRatio: num(r.stockDividendRatio),
      }))
    })
    return c.json(rows, 200)
  })
}
