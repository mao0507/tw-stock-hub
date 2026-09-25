import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes, stocks } from '../../db/schema/stocks.js'
import { aggregate, type Candle, monthKey, monthStart, weekKey } from './candles.js'
import { cached, ErrorBody, findActiveStock, IdParam, json, num } from './shared.js'

// 搜尋、個股資料、K 線（#4）

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD')
const SearchItem = z.object({ id: z.string(), name: z.string(), market: z.string(), sector: z.string().nullable() })
const CandleSchema = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  changePct: z.number().nullable(),
})
const LatestQuote = CandleSchema.extend({
  value: z.number(),
  change: z.number().nullable(),
  transactionCount: z.number().nullable(),
  prevClose: z.number().nullable(),
})
const StockDetail = SearchItem.extend({ isActive: z.boolean(), latestQuote: LatestQuote.nullable() })

const routes = {
  search: createRoute({
    method: 'get',
    path: '/stocks/search',
    request: {
      query: z.object({
        q: z.string().trim().min(1).max(20),
        market: z.enum(['TWSE', 'TPEX', 'ALL']).default('ALL'),
        limit: z.coerce.number().int().min(1).max(20).default(10),
      }),
    },
    responses: { 200: json(z.array(SearchItem), '代號前綴優先，其次名稱包含') },
  }),
  detail: createRoute({
    method: 'get',
    path: '/stocks/{id}',
    request: { params: IdParam },
    responses: { 200: json(StockDetail, '基本資料與最新報價'), 404: json(ErrorBody, '查無股票') },
  }),
  quote: createRoute({
    method: 'get',
    path: '/stocks/{id}/quote',
    request: {
      params: IdParam,
      query: z.object({
        interval: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
        from: DateStr.optional(),
        to: DateStr.optional(),
        limit: z.coerce.number().int().min(1).max(500).default(60),
      }),
    },
    responses: { 200: json(z.array(CandleSchema), 'K 線（由舊到新）'), 404: json(ErrorBody, '查無股票') },
  }),
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

export function registerOverviewRoutes(app: OpenAPIHono, db: Db) {
  const findActive = (id: string) => findActiveStock(db, id)

  app.openapi(routes.search, async (c) => {
    const { q, market, limit } = c.req.valid('query')
    const rows = await cached(`search:${q}:${market}:${limit}`, () => {
      const prefix = `${escapeLike(q)}%`
      return db
        .select({ id: stocks.id, name: stocks.name, market: stocks.market, sector: stocks.sector })
        .from(stocks)
        .where(
          and(
            eq(stocks.isActive, true),
            market === 'ALL' ? undefined : eq(stocks.market, market),
            or(ilike(stocks.id, prefix), ilike(stocks.name, `%${escapeLike(q)}%`)),
          ),
        )
        .orderBy(sql`CASE WHEN ${stocks.id} ILIKE ${prefix} THEN 0 ELSE 1 END`, asc(stocks.id))
        .limit(limit)
    })
    return c.json(rows, 200)
  })

  app.openapi(routes.detail, async (c) => {
    const { id } = c.req.valid('param')
    const detail = await cached(`detail:${id}`, async () => {
      const stock = await findActive(id)
      if (!stock) return { notFound: true as const }
      const [q] = await db.select().from(dailyQuotes).where(eq(dailyQuotes.stockId, id)).orderBy(desc(dailyQuotes.date)).limit(1)
      const close = q ? Number(q.close) : null
      const change = q ? num(q.change) : null
      return {
        ...stock,
        latestQuote: q
          ? {
              date: q.date,
              open: Number(q.open),
              high: Number(q.high),
              low: Number(q.low),
              close: close!,
              volume: q.volume,
              value: q.value,
              change,
              changePct: num(q.changePct),
              transactionCount: q.transactionCount,
              prevClose: change === null ? null : Math.round((close! - change) * 100) / 100,
            }
          : null,
      }
    })
    if ('notFound' in detail) return c.json({ error: `找不到股票代號 ${id}` }, 404)
    return c.json(detail, 200)
  })

  app.openapi(routes.quote, async (c) => {
    const { id } = c.req.valid('param')
    const { interval, from, to, limit } = c.req.valid('query')
    const result = await cached(`quote:${id}:${interval}:${from}:${to}:${limit}`, async () => {
      if (!(await findActive(id))) return { notFound: true as const }
      // ponytail: 週/月 K 以最近 limit 筆日 K 彙總（與舊站行為一致）；要固定根數時改成依區間回推
      const rows = await db
        .select()
        .from(dailyQuotes)
        .where(
          and(
            eq(dailyQuotes.stockId, id),
            from ? gte(dailyQuotes.date, from) : undefined,
            to ? lte(dailyQuotes.date, to) : undefined,
          ),
        )
        .orderBy(desc(dailyQuotes.date))
        .limit(limit)
      rows.reverse()

      // 週/月 K：limit 或 from 可能切在週中/月中，往前補齊最舊那個區間，第一根才不會是殘缺的
      const oldest = rows[0]?.date
      if (oldest && interval !== 'daily') {
        const periodStart = interval === 'weekly' ? weekKey(oldest) : monthStart(oldest)
        if (periodStart < oldest) {
          const head = await db
            .select()
            .from(dailyQuotes)
            .where(and(eq(dailyQuotes.stockId, id), gte(dailyQuotes.date, periodStart), lt(dailyQuotes.date, oldest)))
            .orderBy(asc(dailyQuotes.date))
          rows.unshift(...head)
        }
      }

      const daily: Candle[] = rows.map((r) => ({
        date: r.date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: r.volume,
        changePct: num(r.changePct),
      }))
      if (interval === 'weekly') return { candles: aggregate(daily, weekKey) }
      if (interval === 'monthly') return { candles: aggregate(daily, monthKey) }
      return { candles: daily }
    })
    if ('notFound' in result) return c.json({ error: `找不到股票代號 ${id}` }, 404)
    return c.json(result.candles, 200)
  })
}
