import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, gte, like, lte, max, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes, marketIndex, sectorPerformance, stocks } from '../../db/schema/stocks.js'
import { monthKey, weekKey } from './candles.js'
import { round2 } from './fundamentals-calc.js'
import { cached, ErrorBody, json, num } from './shared.js'

// 首頁與大盤（#7）：總覽、歷史、類股熱力圖、類股成分股

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD')
const NumOrNull = z.number().nullable()
const HistoryItem = z.object({ date: z.string(), close: z.number(), change: z.number(), changePct: z.number(), totalValue: z.number() })

const routes = {
  overview: createRoute({
    method: 'get',
    path: '/market/overview',
    responses: {
      200: json(
        z.object({
          date: z.string(),
          taiexClose: z.number(),
          taiexChange: z.number(),
          taiexChangePct: z.number(),
          totalValue: z.number(),
          totalVolume: z.number(),
          upCount: z.number(),
          downCount: z.number(),
          flatCount: z.number(),
          limitUpCount: z.number(),
          limitDownCount: z.number(),
          taiexOpen: NumOrNull,
          taiexHigh: NumOrNull,
          taiexLow: NumOrNull,
          taiexPrevClose: NumOrNull,
        }),
        '最新一日大盤',
      ),
      404: json(ErrorBody, '目前無大盤資料'),
    },
  }),
  history: createRoute({
    method: 'get',
    path: '/market/history',
    request: {
      query: z.object({
        interval: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
        from: DateStr.optional(),
        to: DateStr.optional(),
        limit: z.coerce.number().int().min(1).max(365).default(60),
      }),
    },
    responses: { 200: json(z.array(HistoryItem), '加權指數歷史（由舊到新）') },
  }),
  heatmap: createRoute({
    method: 'get',
    path: '/market/heatmap',
    responses: {
      200: json(
        z.object({
          date: z.string().nullable(),
          sectors: z.array(z.object({ sectorName: z.string(), changePct: z.number(), value: z.number(), volume: z.number() })),
        }),
        '最新一日類股漲跌',
      ),
    },
  }),
  sectorStocks: createRoute({
    method: 'get',
    path: '/market/sector-stocks',
    request: { query: z.object({ sector: z.string().trim().min(1).max(50) }) },
    responses: {
      200: json(
        z.object({
          sector: z.string(),
          date: z.string().nullable(),
          stocks: z.array(
            z.object({ stockId: z.string(), stockName: z.string(), close: NumOrNull, changePct: NumOrNull, value: NumOrNull }),
          ),
        }),
        '類股成分股（最新交易日）',
      ),
    },
  }),
}

type IndexDay = { date: string; close: number; change: number; totalValue: number }

/**
 * 日線彙總為週/月線：收盤取期末；漲跌與漲跌幅對「前一期收盤」計算，
 * 最舊一期的前收以該期首日「收盤 − 當日漲跌」推得。days 需由舊到新。
 */
export function aggregateIndex(days: readonly IndexDay[], keyOf: (date: string) => string) {
  const buckets = new Map<string, IndexDay[]>()
  for (const d of days) {
    const k = keyOf(d.date)
    const b = buckets.get(k)
    if (b) b.push(d)
    else buckets.set(k, [d])
  }
  let prevClose = days.length ? days[0]!.close - days[0]!.change : 0
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => {
      const last = g.at(-1)!
      const change = round2(last.close - prevClose)
      const item = {
        date: last.date,
        close: last.close,
        change,
        changePct: prevClose ? round2((change / prevClose) * 100) : 0,
        totalValue: g.reduce((s, d) => s + d.totalValue, 0),
      }
      prevClose = last.close
      return item
    })
}

export function registerMarketRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(routes.overview, async (c) => {
    const data = await cached('market:overview', async () => {
      const [m] = await db.select().from(marketIndex).orderBy(desc(marketIndex.date)).limit(1)
      if (!m) return { empty: true as const }
      // market_index 的漲跌家數含權證/ETF 等全部證券；改用上市個股（排除 ETF）行情計算，
      // 與加權指數、漲跌停家數同為上市市場
      const [counts] = await db
        .select({
          up: sql<number>`COUNT(*) FILTER (WHERE ${dailyQuotes.change} > 0)::int`,
          down: sql<number>`COUNT(*) FILTER (WHERE ${dailyQuotes.change} < 0)::int`,
          flat: sql<number>`COUNT(*) FILTER (WHERE ${dailyQuotes.change} = 0)::int`,
          total: sql<number>`COUNT(*)::int`,
        })
        .from(dailyQuotes)
        .innerJoin(stocks, eq(stocks.id, dailyQuotes.stockId))
        .where(and(eq(dailyQuotes.date, m.date), eq(stocks.market, 'TWSE'), sql`${stocks.id} !~ '^00'`))
      const useQuotes = !!counts && counts.total > 0
      return {
        date: m.date,
        taiexClose: Number(m.taiexClose),
        taiexChange: Number(m.taiexChange),
        taiexChangePct: Number(m.taiexChangePct),
        totalValue: m.totalValue,
        totalVolume: m.totalVolume,
        upCount: useQuotes ? counts.up : m.upCount,
        downCount: useQuotes ? counts.down : m.downCount,
        flatCount: useQuotes ? counts.flat : m.flatCount,
        limitUpCount: m.limitUpCount,
        limitDownCount: m.limitDownCount,
        taiexOpen: num(m.taiexOpen),
        taiexHigh: num(m.taiexHigh),
        taiexLow: num(m.taiexLow),
        taiexPrevClose: num(m.taiexPrevClose),
      }
    })
    return 'empty' in data ? c.json({ error: '目前無大盤資料' }, 404) : c.json(data, 200)
  })

  app.openapi(routes.history, async (c) => {
    const { interval, from, to, limit } = c.req.valid('query')
    const items = await cached(`market:history:${interval}:${from}:${to}:${limit}`, async () => {
      const cols = {
        date: marketIndex.date,
        close: marketIndex.taiexClose,
        change: marketIndex.taiexChange,
        changePct: marketIndex.taiexChangePct,
        totalValue: marketIndex.totalValue,
      }
      const range = and(from ? gte(marketIndex.date, from) : undefined, to ? lte(marketIndex.date, to) : undefined)
      if (interval === 'daily') {
        const rows = (await db.select(cols).from(marketIndex).where(range).orderBy(desc(marketIndex.date)).limit(limit)).reverse()
        return rows.map((r) => ({
          date: r.date,
          close: Number(r.close),
          change: Number(r.change),
          changePct: Number(r.changePct),
          totalValue: r.totalValue,
        }))
      }
      // 週/月線：limit 為 K 棒根數 → 區間內全部日線彙總後取最後 N 根（大盤每年約 250 筆，全取可接受）
      const rows = await db.select(cols).from(marketIndex).where(range).orderBy(asc(marketIndex.date))
      const days = rows.map((r) => ({ date: r.date, close: Number(r.close), change: Number(r.change), totalValue: r.totalValue }))
      return aggregateIndex(days, interval === 'weekly' ? weekKey : monthKey).slice(-limit)
    })
    return c.json(items, 200)
  })

  app.openapi(routes.heatmap, async (c) => {
    const data = await cached('market:heatmap', async () => {
      const [{ latest } = { latest: null }] = await db.select({ latest: max(sectorPerformance.date) }).from(sectorPerformance)
      if (!latest) return { date: null, sectors: [] }
      const rows = await db
        .select()
        .from(sectorPerformance)
        .where(and(eq(sectorPerformance.date, latest), like(sectorPerformance.sectorName, '%類指數')))
        .orderBy(desc(sectorPerformance.changePct))
      return {
        date: latest,
        sectors: rows.map((s) => ({
          sectorName: s.sectorName,
          changePct: Number(s.changePct),
          value: s.value ?? 0,
          volume: s.volume ?? 0,
        })),
      }
    })
    return c.json(data, 200)
  })

  app.openapi(routes.sectorStocks, async (c) => {
    const { sector } = c.req.valid('query')
    const data = await cached(`market:sector:${sector}`, async () => {
      // 行情日取該類股成分股的最新交易日（上市、上櫃爬蟲完成時間不同，不能用全表最大日期）
      const [{ latest } = { latest: null }] = await db
        .select({ latest: max(dailyQuotes.date) })
        .from(dailyQuotes)
        .innerJoin(stocks, eq(stocks.id, dailyQuotes.stockId))
        .where(and(eq(stocks.sector, sector), eq(stocks.isActive, true)))
      if (!latest) return { sector, date: null, stocks: [] }
      const rows = await db.execute<{
        stock_id: string
        name: string
        close: string | null
        change_pct: string | null
        value: string | null
      }>(sql`
        SELECT s.id AS stock_id, s.name, q.close, q.change_pct, q.value
        FROM stocks.stocks s
        LEFT JOIN stocks.daily_quotes q ON q.stock_id = s.id AND q.date = ${latest}
        WHERE s.sector = ${sector} AND s.is_active
        ORDER BY q.change_pct DESC NULLS LAST, s.id`)
      return {
        sector,
        date: latest,
        stocks: rows.map((r) => ({
          stockId: r.stock_id,
          stockName: r.name,
          close: num(r.close),
          changePct: num(r.change_pct),
          value: num(r.value),
        })),
      }
    })
    return c.json(data, 200)
  })
}
