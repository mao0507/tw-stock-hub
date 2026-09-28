import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { etfInfo } from '../../db/schema/stocks.js'
import { cached, ErrorBody, findActiveStock, IdParam, json, NOT_FOUND, notFoundBody } from './shared.js'

// ETF 成分（#40）：最新一期成分清單與產業分布。成分表保存每期歷史，這裡只取最新資料日。

const Holding = z.object({
  name: z.string(),
  stockId: z.string().nullable().describe('台股成分才有'),
  symbol: z.string().nullable().describe('來源原始代號，如 2330.TW、NVDA.US'),
  weight: z.number(),
  shares: z.number().nullable(),
  close: z.number().nullable(),
  changePct: z.number().nullable(),
})

const route = createRoute({
  method: 'get',
  path: '/stocks/{id}/etf-holdings',
  request: { params: IdParam },
  responses: {
    200: json(z.object({
      isEtf: z.boolean(),
      dataDate: z.string().nullable(),
      source: z.string().nullable(),
      info: z.array(z.unknown()).describe('MoneyDJ 基本資料（#43 改為結構化）'),
      industries: z.array(z.object({ sector: z.string(), weight: z.number() })),
      holdings: z.array(Holding),
    }), 'ETF 最新一期成分與產業分布'),
    404: json(ErrorBody, '查無股票'),
  },
})

const round2 = (v: number) => Math.round(v * 100) / 100
const n = (v: string | null) => (v == null ? null : Number(v))

type Row = {
  data_date: string; source: string; holding_name: string; stock_id: string | null; symbol: string | null
  weight: string | null; shares: string | null; sector: string | null; close: string | null; change_pct: string | null
}

export function registerEtfRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(route, async (c) => {
    const { id } = c.req.valid('param')
    const r = await cached(`etf-holdings:${id}`, async () => {
      const stock = await findActiveStock(db, id)
      if (!stock) return NOT_FOUND
      if (stock.securityType === 'stock') {
        return { data: { isEtf: false, dataDate: null, source: null, info: [], industries: [], holdings: [] } }
      }
      // 行情是 hypertable：先查最新交易日，再以常數日期 JOIN
      const [[latest], [info]] = await Promise.all([
        db.execute<{ d: string | null }>(sql`SELECT MAX(date)::text AS d FROM stocks.daily_quotes`),
        db.select({ items: etfInfo.items }).from(etfInfo).where(eq(etfInfo.etfId, id)),
      ])
      const rows = await db.execute<Row>(sql`
        SELECT e.data_date::text, e.source, e.holding_name, e.stock_id, e.symbol, e.weight, e.shares,
          s.sector, q.close, q.change_pct
        FROM stocks.etf_constituents e
        LEFT JOIN stocks.stocks s ON s.id = e.stock_id
        LEFT JOIN stocks.daily_quotes q ON q.stock_id = e.stock_id AND q.date = ${latest?.d ?? null}
        WHERE e.etf_id = ${id}
          AND e.data_date = (SELECT MAX(data_date) FROM stocks.etf_constituents WHERE etf_id = ${id})
        ORDER BY e.weight DESC NULLS LAST, e.holding_name`)
      const bySector = new Map<string, number>()
      for (const h of rows) {
        const sector = h.stock_id ? (h.sector?.replace(/類指數$/, '') || '未分類') : '其他'
        bySector.set(sector, (bySector.get(sector) ?? 0) + Number(h.weight ?? 0))
      }
      return {
        data: {
          isEtf: true,
          dataDate: rows[0]?.data_date ?? null,
          source: rows[0]?.source ?? null,
          info: (info?.items as unknown[] | null) ?? [],
          industries: [...bySector]
            .map(([sector, weight]) => ({ sector, weight: round2(weight) }))
            .sort((a, b) => b.weight - a.weight),
          holdings: rows.map((h) => ({
            name: h.holding_name, stockId: h.stock_id, symbol: h.symbol,
            weight: Number(h.weight ?? 0), shares: n(h.shares), close: n(h.close), changePct: n(h.change_pct),
          })),
        },
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })
}
