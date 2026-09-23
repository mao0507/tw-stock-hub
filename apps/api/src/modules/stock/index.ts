import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { desc, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes } from '../../db/schema/stocks.js'
import { responseCache } from '../../lib/cache.js'

const quotesRoute = createRoute({
  method: 'get',
  path: '/stocks/{id}/quotes',
  request: {
    params: z.object({ id: z.string().regex(/^[0-9A-Z]{4,6}$/) }),
    query: z.object({ days: z.coerce.number().int().min(1).max(500).default(60) }),
  },
  responses: {
    200: {
      description: '每日行情（新到舊）',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              date: z.string(),
              open: z.string(),
              high: z.string(),
              low: z.string(),
              close: z.string(),
              volume: z.number(),
            }),
          ),
        },
      },
    },
  },
})

export function createStockRoutes(db: Db) {
  const app = new OpenAPIHono()

  app.openapi(quotesRoute, async (c) => {
    const { id } = c.req.valid('param')
    const { days } = c.req.valid('query')
    const key = `quotes:${id}:${days}`
    const cached = responseCache.get(key)
    if (cached) return c.json(cached as never, 200)

    const rows = await db
      .select({
        date: dailyQuotes.date,
        open: dailyQuotes.open,
        high: dailyQuotes.high,
        low: dailyQuotes.low,
        close: dailyQuotes.close,
        volume: dailyQuotes.volume,
      })
      .from(dailyQuotes)
      .where(eq(dailyQuotes.stockId, id))
      .orderBy(desc(dailyQuotes.date))
      .limit(days)
    responseCache.set(key, rows)
    return c.json(rows, 200)
  })

  return app
}
