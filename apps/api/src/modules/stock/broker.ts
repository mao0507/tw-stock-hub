import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { CalendarDate, cached, ErrorBody, findActiveStock, json, notFoundBody, StockId } from './shared.js'

// 分點（#25）：資料來自 crawler BrokerCrawler（TWSE BSR，僅上市，追蹤清單 + 按需爬取）。
// 股數單位為「股」。按需爬取：上市股查無資料時寫入 pending_jobs（broker:<代號>），由每分鐘輪詢執行。

const BrokerName = z.string().min(1).max(60)
const Limit = z.coerce.number().int().min(1).max(50).default(15)
const ON_DEMAND_COOLDOWN_MIN = 30
const MAX_ON_DEMAND_PENDING = 20

const Item = z.object({ brokerName: z.string(), buy: z.number(), sell: z.number(), net: z.number(), tag: z.string().nullable() })
const Top = z.object({ brokerName: z.string(), net: z.number(), tag: z.string().nullable() })

const routes = {
  ranking: createRoute({
    method: 'get', path: '/broker/ranking',
    request: { query: z.object({ stockId: StockId, date: CalendarDate.optional(), limit: Limit }) },
    responses: {
      200: json(z.object({
        stockId: z.string(), date: z.string().nullable(), topBuy: z.array(Item), topSell: z.array(Item),
        queued: z.boolean().describe('查無資料且已排入按需爬取'),
      }), '個股分點買賣超排行'),
      400: json(ErrorBody, '參數錯誤'), 404: json(ErrorBody, '查無股票'),
    },
  }),
  overview: createRoute({
    method: 'get', path: '/broker/overview',
    responses: {
      200: json(z.object({
        date: z.string().nullable(),
        rows: z.array(z.object({
          stockId: z.string(), stockName: z.string(), brokerCount: z.number(), topBuy: z.array(Top), topSell: z.array(Top),
        })),
      }), '最新日各股前三大分點'),
    },
  }),
  leaderboard: createRoute({
    method: 'get', path: '/broker/leaderboard',
    request: { query: z.object({ limit: Limit }) },
    responses: {
      200: json(z.object({
        date: z.string().nullable(),
        topBuy: z.array(Top.extend({ stockCount: z.number() })),
        topSell: z.array(Top.extend({ stockCount: z.number() })),
      }), '跨股分點買賣超排行'),
      400: json(ErrorBody, '參數錯誤'),
    },
  }),
  detail: createRoute({
    method: 'get', path: '/broker/detail',
    request: { query: z.object({ stockId: StockId, brokerName: BrokerName, date: CalendarDate.optional() }) },
    responses: {
      200: json(z.object({
        stockId: z.string(), brokerName: z.string(), date: z.string().nullable(),
        levels: z.array(z.object({ price: z.number(), buy: z.number(), sell: z.number() })),
      }), '分點價位別明細'),
      400: json(ErrorBody, '參數錯誤'),
    },
  }),
  profile: createRoute({
    method: 'get', path: '/broker/profile',
    request: { query: z.object({ brokerName: BrokerName }) },
    responses: {
      200: json(z.object({
        brokerName: z.string(), tag: z.string().nullable(), date: z.string().nullable(),
        buys: z.array(z.object({ stockId: z.string(), stockName: z.string(), buy: z.number(), sell: z.number(), net: z.number() })),
        sells: z.array(z.object({ stockId: z.string(), stockName: z.string(), buy: z.number(), sell: z.number(), net: z.number() })),
        history: z.array(z.object({ date: z.string(), net: z.number() })),
      }), '分點檔案'),
      400: json(ErrorBody, '參數錯誤'),
    },
  }),
  streak: createRoute({
    method: 'get', path: '/broker/streak',
    request: { query: z.object({ stockId: StockId, brokerName: BrokerName }) },
    responses: {
      200: json(z.object({
        stockId: z.string(), brokerName: z.string(), currentStreak: z.number(),
        direction: z.enum(['buy', 'sell', 'none']), streakStartDate: z.string().nullable(),
      }), '分點在個股的連續買／賣超'),
      400: json(ErrorBody, '參數錯誤'),
    },
  }),
  concentration: createRoute({
    method: 'get', path: '/broker/concentration',
    request: { query: z.object({ stockId: StockId, date: CalendarDate.optional(), topN: z.coerce.number().int().min(1).max(50).default(15) }) },
    responses: {
      200: json(z.object({
        stockId: z.string(), date: z.string().nullable(), topN: z.number(),
        concentrationPct: z.number().describe('(前 N 大買超 − 前 N 大賣超) / 成交量 %'), totalVolume: z.number(),
      }), '籌碼集中度'),
      400: json(ErrorBody, '參數錯誤'),
    },
  }),
}

type Num = string | number
const n = (v: Num | null) => (v == null ? 0 : Number(v))
const TAG = sql`(SELECT tag FROM stocks.broker_group_tags g WHERE g.broker_name = b.broker_name)`

async function latestDate(db: Db, stockId?: string): Promise<string | null> {
  const [r] = await db.execute<{ d: string | null }>(sql`
    SELECT MAX(date)::text AS d FROM stocks.broker_trading ${stockId ? sql`WHERE stock_id = ${stockId}` : sql``}`)
  return r?.d ?? null
}

/**
 * 上市股排入按需爬取；回傳是否在佇列中（上櫃 BSR 無資料 → false）。
 * 同一檔 30 分鐘內不重複排；全站排隊中的按需任務上限 MAX_ON_DEMAND_PENDING，避免被批量觸發。
 * advisory lock 讓「檢查＋寫入」在併發請求下也只排一次。
 */
async function enqueueOnDemand(db: Db, stockId: string, market: string): Promise<boolean> {
  if (market !== 'TWSE') return false
  const job = `broker:${stockId}`
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('broker_on_demand'))`)
    const [r] = await tx.execute<{ recent: boolean; pending: number }>(sql`
      SELECT
        EXISTS (SELECT 1 FROM stocks.pending_jobs WHERE job_name = ${job}
                AND created_at > NOW() - make_interval(mins => ${ON_DEMAND_COOLDOWN_MIN})) AS recent,
        (SELECT COUNT(*)::int FROM stocks.pending_jobs
         WHERE job_name LIKE 'broker:%' AND status IN ('pending', 'running')) AS pending`)
    if (r?.recent) return true
    if ((r?.pending ?? 0) >= MAX_ON_DEMAND_PENDING) return false
    await tx.execute(sql`INSERT INTO stocks.pending_jobs (job_name) VALUES (${job})`)
    return true
  })
}

export function registerBrokerRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(routes.ranking, async (c) => {
    const q = c.req.valid('query')
    const stock = await findActiveStock(db, q.stockId)
    if (!stock) return c.json(notFoundBody(q.stockId), 404)
    const date = q.date ?? (await latestDate(db, q.stockId))
    if (!date) {
      // 不快取：排入後資料會陸續出現
      const queued = await enqueueOnDemand(db, q.stockId, stock.market)
      return c.json({ stockId: q.stockId, date: null, topBuy: [], topSell: [], queued }, 200)
    }
    const body = await cached(`broker:ranking:${JSON.stringify(q)}:${date}`, async () => {
      const side = async (dir: 'buy' | 'sell') => {
        const rows = await db.execute<{ broker_name: string; buy: Num; sell: Num; net: Num; tag: string | null }>(sql`
          SELECT b.broker_name, b.buy, b.sell, b.net, ${TAG} AS tag FROM stocks.broker_trading b
          WHERE b.stock_id = ${q.stockId} AND b.date = ${date} AND ${dir === 'buy' ? sql`b.net > 0` : sql`b.net < 0`}
          ORDER BY b.net ${dir === 'buy' ? sql`DESC` : sql`ASC`}, b.broker_name LIMIT ${q.limit}`)
        return rows.map((r) => ({ brokerName: r.broker_name, buy: n(r.buy), sell: n(r.sell), net: n(r.net), tag: r.tag }))
      }
      return { stockId: q.stockId, date, topBuy: await side('buy'), topSell: await side('sell'), queued: false }
    })
    return c.json(body, 200)
  })

  app.openapi(routes.overview, async (c) => {
    const body = await cached('broker:overview', async () => {
      const date = await latestDate(db)
      if (!date) return { date: null, rows: [] }
      const rows = await db.execute<{ stock_id: string; name: string; broker_name: string; net: Num; tag: string | null; rn_buy: string; rn_sell: string; cnt: string }>(sql`
        SELECT b.stock_id, s.name, b.broker_name, b.net, ${TAG} AS tag,
               ROW_NUMBER() OVER (PARTITION BY b.stock_id ORDER BY b.net DESC, b.broker_name) AS rn_buy,
               ROW_NUMBER() OVER (PARTITION BY b.stock_id ORDER BY b.net ASC, b.broker_name) AS rn_sell,
               COUNT(*) OVER (PARTITION BY b.stock_id) AS cnt
        FROM stocks.broker_trading b JOIN stocks.stocks s ON s.id = b.stock_id
        WHERE b.date = ${date}`)
      const byStock = new Map<string, { stockId: string; stockName: string; brokerCount: number; topBuy: z.infer<typeof Top>[]; topSell: z.infer<typeof Top>[] }>()
      for (const r of rows) {
        const row = byStock.get(r.stock_id) ?? { stockId: r.stock_id, stockName: r.name, brokerCount: Number(r.cnt), topBuy: [], topSell: [] }
        byStock.set(r.stock_id, row)
        const item = { brokerName: r.broker_name, net: n(r.net), tag: r.tag }
        if (Number(r.rn_buy) <= 3 && item.net > 0) row.topBuy.push(item)
        if (Number(r.rn_sell) <= 3 && item.net < 0) row.topSell.push(item)
      }
      for (const row of byStock.values()) {
        row.topBuy.sort((a, b) => b.net - a.net)
        row.topSell.sort((a, b) => a.net - b.net)
      }
      return { date, rows: [...byStock.values()].sort((a, b) => a.stockId.localeCompare(b.stockId)) }
    })
    return c.json(body, 200)
  })

  app.openapi(routes.leaderboard, async (c) => {
    const { limit } = c.req.valid('query')
    const body = await cached(`broker:leaderboard:${limit}`, async () => {
      const date = await latestDate(db)
      if (!date) return { date: null, topBuy: [], topSell: [] }
      const side = async (dir: 'buy' | 'sell') => {
        const rows = await db.execute<{ broker_name: string; net: Num; cnt: string; tag: string | null }>(sql`
          SELECT b.broker_name, SUM(b.net) AS net, COUNT(*) AS cnt, ${TAG} AS tag
          FROM stocks.broker_trading b WHERE b.date = ${date}
          GROUP BY b.broker_name
          HAVING SUM(b.net) ${dir === 'buy' ? sql`> 0` : sql`< 0`}
          ORDER BY SUM(b.net) ${dir === 'buy' ? sql`DESC` : sql`ASC`}, b.broker_name LIMIT ${limit}`)
        return rows.map((r) => ({ brokerName: r.broker_name, net: n(r.net), stockCount: Number(r.cnt), tag: r.tag }))
      }
      return { date, topBuy: await side('buy'), topSell: await side('sell') }
    })
    return c.json(body, 200)
  })

  app.openapi(routes.detail, async (c) => {
    const q = c.req.valid('query')
    const body = await cached(`broker:detail:${JSON.stringify(q)}`, async () => {
      const date = q.date ?? (await latestDate(db, q.stockId))
      const rows = date
        ? await db.execute<{ price: Num; buy: Num; sell: Num }>(sql`
            SELECT price, buy, sell FROM stocks.broker_trading_detail
            WHERE stock_id = ${q.stockId} AND broker_name = ${q.brokerName} AND date = ${date}
            ORDER BY price`)
        : []
      return { stockId: q.stockId, brokerName: q.brokerName, date, levels: rows.map((r) => ({ price: n(r.price), buy: n(r.buy), sell: n(r.sell) })) }
    })
    return c.json(body, 200)
  })

  app.openapi(routes.profile, async (c) => {
    const { brokerName } = c.req.valid('query')
    const body = await cached(`broker:profile:${brokerName}`, async () => {
      const [meta] = await db.execute<{ d: string | null; tag: string | null }>(sql`
        SELECT MAX(date)::text AS d, (SELECT tag FROM stocks.broker_group_tags WHERE broker_name = ${brokerName}) AS tag
        FROM stocks.broker_trading WHERE broker_name = ${brokerName}`)
      const date = meta?.d ?? null
      const rows = date
        ? await db.execute<{ stock_id: string; name: string; buy: Num; sell: Num; net: Num }>(sql`
            SELECT b.stock_id, s.name, b.buy, b.sell, b.net FROM stocks.broker_trading b
            JOIN stocks.stocks s ON s.id = b.stock_id
            WHERE b.broker_name = ${brokerName} AND b.date = ${date}`)
        : []
      const history = await db.execute<{ d: string; net: Num }>(sql`
        SELECT date::text AS d, SUM(net) AS net FROM stocks.broker_trading
        WHERE broker_name = ${brokerName} GROUP BY date ORDER BY date DESC LIMIT 60`)
      const items = rows.map((r) => ({ stockId: r.stock_id, stockName: r.name, buy: n(r.buy), sell: n(r.sell), net: n(r.net) }))
      return {
        brokerName, tag: meta?.tag ?? null, date,
        buys: items.filter((i) => i.net > 0).sort((a, b) => b.net - a.net),
        sells: items.filter((i) => i.net < 0).sort((a, b) => a.net - b.net),
        history: history.reverse().map((h) => ({ date: h.d, net: n(h.net) })),
      }
    })
    return c.json(body, 200)
  })

  app.openapi(routes.streak, async (c) => {
    const q = c.req.valid('query')
    const body = await cached(`broker:streak:${JSON.stringify(q)}`, async () => {
      // 以該股有分點資料的交易日為序；某天沒出現視為 0（中斷連續）
      const rows = await db.execute<{ d: string; net: Num | null }>(sql`
        SELECT d.date::text AS d, b.net FROM (
          SELECT DISTINCT date FROM stocks.broker_trading WHERE stock_id = ${q.stockId}
          ORDER BY date DESC LIMIT 120
        ) d
        LEFT JOIN stocks.broker_trading b
          ON b.date = d.date AND b.stock_id = ${q.stockId} AND b.broker_name = ${q.brokerName}
        ORDER BY d.date DESC`)
      const sign = (v: Num | null) => Math.sign(n(v))
      const first = rows[0] ? sign(rows[0].net) : 0
      let count = 0
      while (first !== 0 && count < rows.length && sign(rows[count]!.net) === first) count++
      return {
        stockId: q.stockId, brokerName: q.brokerName, currentStreak: count,
        direction: first > 0 ? 'buy' as const : first < 0 ? 'sell' as const : 'none' as const,
        streakStartDate: count ? rows[count - 1]!.d : null,
      }
    })
    return c.json(body, 200)
  })

  app.openapi(routes.concentration, async (c) => {
    const q = c.req.valid('query')
    const body = await cached(`broker:conc:${JSON.stringify(q)}`, async () => {
      const date = q.date ?? (await latestDate(db, q.stockId))
      if (!date) return { stockId: q.stockId, date: null, topN: q.topN, concentrationPct: 0, totalVolume: 0 }
      const [r] = await db.execute<{ buy: Num | null; sell: Num | null; vol: Num | null }>(sql`
        SELECT
          (SELECT SUM(net) FROM (SELECT net FROM stocks.broker_trading
             WHERE stock_id = ${q.stockId} AND date = ${date} AND net > 0 ORDER BY net DESC LIMIT ${q.topN}) x) AS buy,
          (SELECT SUM(-net) FROM (SELECT net FROM stocks.broker_trading
             WHERE stock_id = ${q.stockId} AND date = ${date} AND net < 0 ORDER BY net ASC LIMIT ${q.topN}) y) AS sell,
          (SELECT volume FROM stocks.daily_quotes WHERE stock_id = ${q.stockId} AND date = ${date}) AS vol`)
      const vol = n(r?.vol ?? null)
      const pct = vol ? Math.round(((n(r?.buy ?? null) - n(r?.sell ?? null)) / vol) * 10000) / 100 : 0
      return { stockId: q.stockId, date, topN: q.topN, concentrationPct: pct, totalVolume: vol }
    })
    return c.json(body, 200)
  })
}
