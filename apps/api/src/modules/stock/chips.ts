import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { desc, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { institutionalTrading, marginTrading, shareholderDispersion } from '../../db/schema/stocks.js'
import { cached, ErrorBody, findActiveStock, IdParam, json, NOT_FOUND, notFoundBody, num } from './shared.js'

// 個股籌碼：三大法人、融資融券、大戶持股（#5）。皆由舊到新。

const Days = z.object({ days: z.coerce.number().int().min(1).max(60).default(20) })

const routes = {
  institutional: createRoute({
    method: 'get',
    path: '/stocks/{id}/institutional',
    request: { params: IdParam, query: Days },
    responses: {
      200: json(
        z.array(z.object({ date: z.string(), foreignNet: z.number(), trustNet: z.number(), dealerNet: z.number(), totalNet: z.number() })),
        '三大法人買賣超（股）',
      ),
      404: json(ErrorBody, '查無股票'),
    },
  }),
  margin: createRoute({
    method: 'get',
    path: '/stocks/{id}/margin',
    request: { params: IdParam, query: Days },
    responses: {
      200: json(
        z.array(
          z.object({
            date: z.string(),
            marginBalance: z.number(),
            marginChange: z.number(),
            shortBalance: z.number(),
            shortChange: z.number(),
            ratio: z.number().nullable(),
          }),
        ),
        '融資融券；ratio 為券資比（%）',
      ),
      404: json(ErrorBody, '查無股票'),
    },
  }),
  holders: createRoute({
    method: 'get',
    path: '/stocks/{id}/holders',
    request: { params: IdParam, query: z.object({ limit: z.coerce.number().int().min(1).max(52).default(26) }) },
    responses: {
      200: json(
        z.array(
          z.object({
            date: z.string(),
            bigHolderPct: z.number().nullable(),
            bigHolderCount: z.number().nullable(),
            totalHolders: z.number().nullable(),
          }),
        ),
        '大戶持股（週資料）',
      ),
      404: json(ErrorBody, '查無股票'),
    },
  }),
}

/** 券資比 = 融券餘額 ÷ 融資餘額（%）；融資餘額為 0 時無意義 */
const shortMarginRatio = (margin: number, short: number) =>
  margin > 0 ? Math.round((short / margin) * 10000) / 100 : null

export function registerChipRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(routes.institutional, async (c) => {
    const { id } = c.req.valid('param')
    const { days } = c.req.valid('query')
    const r = await cached(`inst:${id}:${days}`, async () => {
      if (!(await findActiveStock(db, id))) return NOT_FOUND
      const rows = await db
        .select({
          date: institutionalTrading.date,
          foreignNet: institutionalTrading.foreignNet,
          trustNet: institutionalTrading.trustNet,
          dealerNet: institutionalTrading.dealerNet,
          totalNet: institutionalTrading.totalNet,
        })
        .from(institutionalTrading)
        .where(eq(institutionalTrading.stockId, id))
        .orderBy(desc(institutionalTrading.date))
        .limit(days)
      return { rows: rows.reverse() }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.rows, 200)
  })

  app.openapi(routes.margin, async (c) => {
    const { id } = c.req.valid('param')
    const { days } = c.req.valid('query')
    const r = await cached(`margin:${id}:${days}`, async () => {
      if (!(await findActiveStock(db, id))) return NOT_FOUND
      const rows = await db
        .select({
          date: marginTrading.date,
          marginBalance: marginTrading.marginBalance,
          marginChange: marginTrading.marginChange,
          shortBalance: marginTrading.shortBalance,
          shortChange: marginTrading.shortChange,
        })
        .from(marginTrading)
        .where(eq(marginTrading.stockId, id))
        .orderBy(desc(marginTrading.date))
        .limit(days)
      return { rows: rows.reverse().map((m) => ({ ...m, ratio: shortMarginRatio(m.marginBalance, m.shortBalance) })) }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.rows, 200)
  })

  app.openapi(routes.holders, async (c) => {
    const { id } = c.req.valid('param')
    const { limit } = c.req.valid('query')
    const r = await cached(`holders:${id}:${limit}`, async () => {
      if (!(await findActiveStock(db, id))) return NOT_FOUND
      const rows = await db
        .select()
        .from(shareholderDispersion)
        .where(eq(shareholderDispersion.stockId, id))
        .orderBy(desc(shareholderDispersion.date))
        .limit(limit)
      return {
        rows: rows.reverse().map((h) => ({
          date: h.date,
          bigHolderPct: num(h.bigHolderPct),
          bigHolderCount: h.bigHolderCount,
          totalHolders: h.totalHolders,
        })),
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.rows, 200)
  })
}
