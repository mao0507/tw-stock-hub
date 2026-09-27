import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import type { AuthEnv } from '../../middleware/auth.js'

// 今日訊號（#31）：只看自己的自選股／持股。已由父層 portfolio router 掛 requireAuth
// 全市場版在 stock 模組（/api/signals/today）

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const route = createRoute({
  method: 'get',
  path: '/signals/today',
  request: { query: z.object({ scope: z.enum(['watchlist', 'holdings', 'mine']).default('mine') }) },
  responses: {
    200: json(z.object({
      date: z.string().nullable(),
      items: z.array(z.object({
        stockId: z.string(), stockName: z.string(), signal: z.string(), side: z.enum(['bull', 'bear']),
        values: z.record(z.string(), z.number()), close: z.number().nullable(), changePct: z.number().nullable(),
        inWatchlist: z.boolean(), inHoldings: z.boolean(),
      })),
    }), '最新訊號日、我的股票的訊號（依股票、訊號代碼排序）'),
    400: json(z.object({ error: z.string() }), '參數錯誤'),
  },
})

export function createSignalRoutes(db: Db) {
  const app = new OpenAPIHono<AuthEnv>()

  app.openapi(route, async (c) => {
    const uid = c.get('jwtPayload').sub
    const { scope } = c.req.valid('query')
    const [latest] = await db.execute<{ d: string | null }>(sql`SELECT MAX(date)::text AS d FROM stocks.technical_signals`)
    const d = latest?.d ?? null
    if (!d) return c.json({ date: null, items: [] }, 200)
    const rows = await db.execute<{
      stock_id: string; name: string; signal: string; side: string; values: Record<string, number>
      close: string | null; change_pct: string | null; in_watchlist: boolean; in_holdings: boolean
    }>(sql`
      WITH mine AS (
        SELECT stock_id,
               bool_or(src = 'w') AS in_watchlist,
               bool_or(src = 'h') AS in_holdings
        FROM (
          SELECT stock_id, 'w' AS src FROM members.watchlists WHERE user_id = ${uid}
          UNION ALL
          SELECT stock_id, 'h' FROM members.holdings WHERE user_id = ${uid} AND shares > 0
        ) x
        GROUP BY stock_id
      )
      SELECT t.stock_id, s.name, t.signal, t.side, t."values", q.close, q.change_pct, m.in_watchlist, m.in_holdings
      FROM stocks.technical_signals t
      JOIN mine m ON m.stock_id = t.stock_id
      JOIN stocks.stocks s ON s.id = t.stock_id
      LEFT JOIN stocks.daily_quotes q ON q.stock_id = t.stock_id AND q.date = ${d}
      WHERE t.date = ${d}
        ${scope === 'watchlist' ? sql`AND m.in_watchlist` : scope === 'holdings' ? sql`AND m.in_holdings` : sql``}
      ORDER BY t.stock_id, t.signal`)
    return c.json({
      date: d,
      items: rows.map((r) => ({
        stockId: r.stock_id, stockName: r.name, signal: r.signal, side: r.side as 'bull' | 'bear', values: r.values,
        close: r.close == null ? null : Number(r.close), changePct: r.change_pct == null ? null : Number(r.change_pct),
        inWatchlist: r.in_watchlist, inHoldings: r.in_holdings,
      })),
    }, 200)
  })

  return app
}
