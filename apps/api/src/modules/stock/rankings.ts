import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { type SQL, and, asc, desc, eq, gte, lte, max, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes, institutionalTrading as it, marginTrading as mt, stocks } from '../../db/schema/stocks.js'
import { CalendarDate, cached, json } from './shared.js'

// 法人與融資排行（#8）

const Market = z.enum(['TWSE', 'TPEX', 'ALL']).default('ALL')
const Limit = z.coerce.number().int().min(1).max(100).default(20)
const InstType = z.enum(['foreign', 'trust', 'dealer', 'total']).default('total')

const Row = z.record(z.string(), z.unknown())
const routes = {
  instRanking: createRoute({
    method: 'get',
    path: '/institutional/ranking',
    request: {
      query: z.object({ date: CalendarDate.optional(), market: Market, type: InstType, order: z.enum(['buy', 'sell']).default('buy'), limit: Limit }),
    },
    responses: { 200: json(z.array(Row), '法人買賣超排行（股）') },
  }),
  instContinuous: createRoute({
    method: 'get',
    path: '/institutional/continuous',
    request: {
      query: z.object({
        days: z.coerce.number().int().min(2).max(20).default(3),
        direction: z.enum(['buy', 'sell']).default('buy'),
        type: InstType,
        market: Market,
      }),
    },
    responses: { 200: json(z.array(Row), '連續 N 個交易日買超/賣超') },
  }),
  marginRanking: createRoute({
    method: 'get',
    path: '/margin/ranking',
    request: {
      query: z.object({ date: CalendarDate.optional(), order: z.enum(['increase', 'decrease']).default('increase'), market: Market, limit: Limit }),
    },
    responses: { 200: json(z.array(Row), '融資增減排行') },
  }),
  highRatio: createRoute({
    method: 'get',
    path: '/margin/high-ratio',
    request: {
      query: z.object({ threshold: z.coerce.number().min(0).max(100).default(30), market: Market, limit: Limit }),
    },
    responses: { 200: json(z.array(Row), '高券資比') },
  }),
}

/** 各法人對應的買、賣、淨額欄位；合計的買賣為三大法人加總 */
const instColumns = (type: z.infer<typeof InstType>): { buy: SQL; sell: SQL; net: SQL } => {
  switch (type) {
    case 'foreign':
      return { buy: sql`${it.foreignBuy}`, sell: sql`${it.foreignSell}`, net: sql`${it.foreignNet}` }
    case 'trust':
      return { buy: sql`${it.trustBuy}`, sell: sql`${it.trustSell}`, net: sql`${it.trustNet}` }
    case 'dealer':
      return { buy: sql`${it.dealerBuy}`, sell: sql`${it.dealerSell}`, net: sql`${it.dealerNet}` }
    default:
      return {
        buy: sql`(${it.foreignBuy} + ${it.trustBuy} + ${it.dealerBuy})`,
        sell: sql`(${it.foreignSell} + ${it.trustSell} + ${it.dealerSell})`,
        net: sql`${it.totalNet}`,
      }
  }
}

/** 上市中且符合市場篩選的股票 */
const activeIn = (market: string) =>
  and(eq(stocks.isActive, true), market === 'ALL' ? undefined : eq(stocks.market, market))

const round2 = (n: number) => Math.round(n * 100) / 100

export function registerRankingRoutes(app: OpenAPIHono, db: Db) {
  /**
   * 指定市場最新有資料的日期。上市、上櫃爬蟲完成時間不同：ALL 取「各市場最新日期」中較早者，
   * 避免只有一個市場到齊時整個另一個市場從排行消失。
   */
  const latestDate = async (table: typeof it | typeof mt, market: string): Promise<string | null> => {
    const perMarket = await db
      .select({ d: max(table.date) })
      .from(table)
      .innerJoin(stocks, eq(stocks.id, table.stockId))
      .where(activeIn(market))
      .groupBy(stocks.market)
    const dates = perMarket.map((r) => r.d).filter((d): d is string => !!d).sort()
    return dates[0] ?? null
  }

  app.openapi(routes.instRanking, async (c) => {
    const q = c.req.valid('query')
    const rows = await cached(`inst-rank:${JSON.stringify(q)}`, async () => {
      const date = q.date ?? (await latestDate(it, q.market))
      if (!date) return []
      const col = instColumns(q.type)
      const result = await db
        .select({
          stockId: it.stockId,
          stockName: stocks.name,
          market: stocks.market,
          buyAmount: sql<number>`${col.buy}::bigint`.mapWith(Number),
          sellAmount: sql<number>`${col.sell}::bigint`.mapWith(Number),
          netAmount: sql<number>`${col.net}::bigint`.mapWith(Number),
        })
        .from(it)
        .innerJoin(stocks, eq(stocks.id, it.stockId))
        .where(and(eq(it.date, date), activeIn(q.market)))
        .orderBy(q.order === 'buy' ? desc(col.net) : asc(col.net), asc(it.stockId))
        .limit(q.limit)
      return result
    })
    return c.json(rows, 200)
  })

  app.openapi(routes.instContinuous, async (c) => {
    const q = c.req.valid('query')
    const rows = await cached(`inst-cont:${JSON.stringify(q)}`, async () => {
      const cutoff = await latestDate(it, q.market)
      if (!cutoff) return []
      const dates = await db
        .selectDistinct({ d: it.date })
        .from(it)
        .innerJoin(stocks, eq(stocks.id, it.stockId))
        .where(and(activeIn(q.market), lte(it.date, cutoff)))
        .orderBy(desc(it.date))
        .limit(q.days)
      if (dates.length < q.days) return []
      const oldest = dates.at(-1)!.d
      const net = instColumns(q.type).net
      const every = q.direction === 'buy' ? sql`bool_and(${net} > 0)` : sql`bool_and(${net} < 0)`
      // 最近 N 個交易日每天都有資料且方向一致；附最新收盤（LATERAL 一次查完，不逐檔查）
      const result = await db.execute<{ stock_id: string; name: string; total: string; close: string | null }>(sql`
        SELECT x.stock_id, x.name, x.total, q.close
        FROM (
          SELECT ${it.stockId} AS stock_id, ${stocks.name} AS name, SUM(${net}) AS total
          FROM ${it}
          JOIN ${stocks} ON ${stocks.id} = ${it.stockId}
          WHERE ${it.date} BETWEEN ${oldest} AND ${cutoff} AND ${activeIn(q.market)}
          GROUP BY ${it.stockId}, ${stocks.name}
          HAVING COUNT(*) = ${q.days} AND ${every}
        ) x
        LEFT JOIN LATERAL (
          SELECT close FROM stocks.daily_quotes WHERE stock_id = x.stock_id ORDER BY date DESC LIMIT 1
        ) q ON TRUE
        ORDER BY ABS(x.total) DESC, x.stock_id
        LIMIT 200`)
      return result.map((r) => ({
        stockId: r.stock_id,
        stockName: r.name,
        continuousDays: q.days,
        totalNet: Number(r.total),
        latestClose: r.close === null ? 0 : Number(r.close),
      }))
    })
    return c.json(rows, 200)
  })

  /** 融資資料 + 同日收盤（無收盤為 0，沿用舊站） */
  const marginRows = (date: string, market: string, extra: SQL | undefined) =>
    db
      .select({
        stockId: mt.stockId,
        stockName: stocks.name,
        market: stocks.market,
        marginBalance: mt.marginBalance,
        marginChange: mt.marginChange,
        shortBalance: mt.shortBalance,
        close: dailyQuotes.close,
      })
      .from(mt)
      .innerJoin(stocks, eq(stocks.id, mt.stockId))
      .leftJoin(dailyQuotes, and(eq(dailyQuotes.stockId, mt.stockId), eq(dailyQuotes.date, mt.date)))
      .where(and(eq(mt.date, date), activeIn(market), extra))

  app.openapi(routes.marginRanking, async (c) => {
    const q = c.req.valid('query')
    const rows = await cached(`margin-rank:${JSON.stringify(q)}`, async () => {
      const date = q.date ?? (await latestDate(mt, q.market))
      if (!date) return []
      const result = await marginRows(date, q.market, undefined)
        .orderBy(q.order === 'increase' ? desc(mt.marginChange) : asc(mt.marginChange), asc(mt.stockId))
        .limit(q.limit)
      return result.map((r) => {
        const prev = r.marginBalance - r.marginChange
        return {
          stockId: r.stockId,
          stockName: r.stockName,
          market: r.market,
          marginBalance: r.marginBalance,
          marginChange: r.marginChange,
          marginChangeRate: prev > 0 ? round2((r.marginChange / prev) * 100) : 0,
          latestClose: r.close === null ? 0 : Number(r.close),
        }
      })
    })
    return c.json(rows, 200)
  })

  app.openapi(routes.highRatio, async (c) => {
    const q = c.req.valid('query')
    const rows = await cached(`margin-ratio:${JSON.stringify(q)}`, async () => {
      const date = await latestDate(mt, q.market)
      if (!date) return []
      const ratio = sql`(${mt.shortBalance}::float8 / ${mt.marginBalance}::float8 * 100)`
      const result = await marginRows(date, q.market, and(sql`${mt.marginBalance} > 0`, gte(ratio, q.threshold)))
        .orderBy(desc(ratio), asc(mt.stockId))
        .limit(q.limit)
      return result.map((r) => ({
        stockId: r.stockId,
        stockName: r.stockName,
        market: r.market,
        marginBalance: r.marginBalance,
        shortBalance: r.shortBalance,
        ratio: round2((r.shortBalance / r.marginBalance) * 100),
        latestClose: r.close === null ? 0 : Number(r.close),
      }))
    })
    return c.json(rows, 200)
  })
}
