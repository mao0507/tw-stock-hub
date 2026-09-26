import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { CalendarDate, cached, ErrorBody, findActiveStock, IdParam, json, notFoundBody, StockId } from './shared.js'

// 新聞（#24）：最新新聞、個股新聞、重大訊息。news 保留 180 天（hypertable retention）。

const Source = z.enum(['mops', 'cnyes', 'yahoo', 'moneydj', 'twse'])
const Category = z.enum(['major_announcement', 'market_news', 'analyst', 'official'])
const Paging = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}
const Filters = z.object({ ...Paging, source: Source.optional(), category: Category.optional() })

const Item = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  source: Source,
  category: Category,
  url: z.string(),
  publishedAt: z.string(),
})
const PageBody = z.object({
  items: z.array(Item),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

const latestRoute = createRoute({
  method: 'get',
  path: '/news/latest',
  request: { query: Filters },
  responses: { 200: json(PageBody, '最新新聞（新到舊）'), 400: json(ErrorBody, '參數錯誤') },
})
const stockRoute = createRoute({
  method: 'get',
  path: '/stocks/{id}/news',
  request: { params: IdParam, query: Filters },
  responses: { 200: json(PageBody, '個股相關新聞'), 400: json(ErrorBody, '參數錯誤'), 404: json(ErrorBody, '查無股票') },
})
const mopsRoute = createRoute({
  method: 'get',
  path: '/news/mops',
  request: {
    query: z.object({ ...Paging, stockId: StockId.optional(), from: CalendarDate.optional(), to: CalendarDate.optional() }),
  },
  responses: { 200: json(PageBody, '重大訊息'), 400: json(ErrorBody, '參數錯誤') },
})

type Row = { id: string; title: string; summary: string | null; source: string; category: string; url: string; published_at: Date; total: string }

async function page(db: Db, where: SQL[], p: number, limit: number) {
  const rows = await db.execute<Row>(sql`
    SELECT n.id, n.title, n.summary, n.source::text AS source, n.category::text AS category, n.url, n.published_at,
           COUNT(*) OVER () AS total
    FROM stocks.news n
    ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
    ORDER BY n.published_at DESC, n.id
    LIMIT ${limit} OFFSET ${(p - 1) * limit}`)
  // 頁碼超出範圍時沒有列可帶 total → 另外計數
  const total = rows[0]
    ? Number(rows[0].total)
    : Number((await db.execute<{ n: string }>(sql`
        SELECT COUNT(*) AS n FROM stocks.news n
        ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}`))[0]?.n ?? 0)
  return {
    items: rows.map((r) => ({
      id: r.id, title: r.title, summary: r.summary,
      source: r.source as z.infer<typeof Source>, category: r.category as z.infer<typeof Category>,
      url: r.url, publishedAt: new Date(r.published_at).toISOString(),
    })),
    page: p, limit, total, totalPages: Math.ceil(total / limit),
  }
}

const relatedTo = (id: string) =>
  sql`EXISTS (SELECT 1 FROM stocks.news_stock_relations r WHERE r.news_id = n.id AND r.stock_id = ${id})`

function filters(q: { source?: string; category?: string }): SQL[] {
  return [
    ...(q.source ? [sql`n.source = ${q.source}::stocks.news_source_enum`] : []),
    ...(q.category ? [sql`n.category = ${q.category}::stocks.news_category_enum`] : []),
  ]
}

export function registerNewsRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(latestRoute, async (c) => {
    const q = c.req.valid('query')
    return c.json(await cached(`news:latest:${JSON.stringify(q)}`, () => page(db, filters(q), q.page, q.limit)), 200)
  })

  app.openapi(stockRoute, async (c) => {
    const { id } = c.req.valid('param')
    const q = c.req.valid('query')
    if (!(await findActiveStock(db, id))) return c.json(notFoundBody(id), 404)
    const body = await cached(`news:stock:${id}:${JSON.stringify(q)}`, () =>
      page(db, [relatedTo(id), ...filters(q)], q.page, q.limit))
    return c.json(body, 200)
  })

  app.openapi(mopsRoute, async (c) => {
    const q = c.req.valid('query')
    const where = [
      sql`n.category = 'major_announcement'`,
      ...(q.stockId ? [relatedTo(q.stockId)] : []),
      // 以台灣時間的日期界定區間
      ...(q.from ? [sql`n.published_at >= (${q.from}::date)::timestamp AT TIME ZONE 'Asia/Taipei'`] : []),
      ...(q.to ? [sql`n.published_at < ((${q.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Taipei')`] : []),
    ]
    return c.json(await cached(`news:mops:${JSON.stringify(q)}`, () => page(db, where, q.page, q.limit)), 200)
  })
}
