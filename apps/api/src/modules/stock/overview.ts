import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes, stocks } from '../../db/schema/stocks.js'
import { aggregate, type Candle, monthKey, weekKey } from './candles.js'
import { CalendarDate, cached, ErrorBody, findActiveStock, IdParam, json, num } from './shared.js'

// 搜尋、個股資料、K 線（#4）

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
        from: CalendarDate.optional(),
        to: CalendarDate.optional(),
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
      const range = and(
        eq(dailyQuotes.stockId, id),
        from ? gte(dailyQuotes.date, from) : undefined,
        to ? lte(dailyQuotes.date, to) : undefined,
      )
      // 日 K：limit 為筆數。週/月 K：limit 為 K 棒根數 → 取區間內全部日 K 彙總後再取最後 N 根，
      // 最舊一根才會是完整週期（有 from 時則從 from 起算）。
      // ponytail: 單一個股 20 年約 5000 筆日 K，全取可接受；資料量變大時改依 limit 回推起始日
      const rows =
        interval === 'daily'
          ? (await db.select().from(dailyQuotes).where(range).orderBy(desc(dailyQuotes.date)).limit(limit)).reverse()
          : await db.select().from(dailyQuotes).where(range).orderBy(asc(dailyQuotes.date))

      const daily: Candle[] = rows.map((r) => ({
        date: r.date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: r.volume,
        changePct: num(r.changePct),
      }))
      if (interval === 'daily') return { candles: daily }
      return { candles: aggregate(daily, interval === 'weekly' ? weekKey : monthKey).slice(-limit) }
    })
    if ('notFound' in result) return c.json({ error: `找不到股票代號 ${id}` }, 404)
    return c.json(result.candles, 200)
  })
}
