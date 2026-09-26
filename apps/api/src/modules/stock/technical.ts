import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes, marketStrength as ms, technicalIndicators as ti } from '../../db/schema/stocks.js'
import { cached, ErrorBody, findActiveStock, IdParam, json, NOT_FOUND, notFoundBody, num } from './shared.js'

// 技術指標（#19）與 RS 相對強弱（#20）：crawler 每日預算，這裡只讀

const MA_KEYS = ['ma5', 'ma10', 'ma20', 'ma60', 'ma120', 'ma240'] as const
const Nullable = z.number().nullable()

const Point = z.object({
  date: z.string(),
  ma5: Nullable, ma10: Nullable, ma20: Nullable, ma60: Nullable, ma120: Nullable, ma240: Nullable,
  rsi14: Nullable, k9: Nullable, d9: Nullable,
  dif: Nullable, dea: Nullable, macdHist: Nullable,
  volMa5: Nullable, volMa20: Nullable,
  rsScore: Nullable.describe('RS 相對強弱百分位 1–99'),
})
type Point = z.infer<typeof Point>

const route = createRoute({
  method: 'get',
  path: '/stocks/{id}/indicators',
  request: {
    params: IdParam,
    query: z.object({ days: z.coerce.number().int().min(1).max(750).default(120) }),
  },
  responses: {
    200: json(
      z.object({
        latest: Point.extend({
          close: z.number(),
          bullishAlignment: z.boolean().describe('MA5 > MA10 > MA20 > MA60'),
          aboveMa20: z.boolean().nullable(),
          aboveMa60: z.boolean().nullable(),
        }).nullable(),
        series: z.array(Point),
      }),
      '技術指標（序列依日期升冪）',
    ),
    400: json(ErrorBody, '參數錯誤'),
    404: json(ErrorBody, '查無股票'),
  },
})

const above = (close: number, ma: number | null) => (ma == null ? null : close > ma)

/** 均線多頭排列：短天期均線依序在長天期之上（任一缺值即不成立） */
export function isBullishAlignment(p: Pick<Point, 'ma5' | 'ma10' | 'ma20' | 'ma60'>): boolean {
  const ms = [p.ma5, p.ma10, p.ma20, p.ma60]
  return ms.every((m) => m != null) && ms.every((m, i) => i === 0 || m! < ms[i - 1]!)
}

export function registerTechnicalRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(route, async (c) => {
    const { id } = c.req.valid('param')
    const { days } = c.req.valid('query')
    const r = await cached(`indicators:${id}:${days}`, async () => {
      if (!(await findActiveStock(db, id))) return NOT_FOUND
      const [rows, [quote]] = await Promise.all([
        db.select({ ti, rsScore: ms.rsScore }).from(ti)
          .leftJoin(ms, and(eq(ms.stockId, ti.stockId), eq(ms.date, ti.date)))
          .where(eq(ti.stockId, id)).orderBy(desc(ti.date)).limit(days),
        db.select({ date: dailyQuotes.date, close: dailyQuotes.close }).from(dailyQuotes)
          .where(eq(dailyQuotes.stockId, id)).orderBy(desc(dailyQuotes.date)).limit(1),
      ])
      const series: Point[] = rows.reverse().map(({ ti: x, rsScore }) => ({
        date: x.date,
        ...Object.fromEntries(MA_KEYS.map((k) => [k, num(x[k])])) as Pick<Point, (typeof MA_KEYS)[number]>,
        rsi14: num(x.rsi14), k9: num(x.k9), d9: num(x.d9),
        dif: num(x.dif), dea: num(x.dea), macdHist: num(x.macdHist),
        volMa5: x.volMa5, volMa20: x.volMa20,
        rsScore,
      }))
      const last = series.at(-1)
      if (!last || !quote) return { data: { latest: null, series } }
      const close = Number(quote.close)
      return {
        data: {
          latest: {
            ...last,
            close,
            bullishAlignment: isBullishAlignment(last),
            aboveMa20: above(close, last.ma20),
            aboveMa60: above(close, last.ma60),
          },
          series,
        },
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })
}
