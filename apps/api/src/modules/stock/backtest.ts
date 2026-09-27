import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes } from '../../db/schema/stocks.js'
import { resolveParams, runBacktest, STRATEGIES, STRATEGY_KEYS, warmupBars } from './backtest-engine.js'
import { CalendarDate, cached, ErrorBody, findActiveStock, json, NOT_FOUND, notFoundBody, StockId } from './shared.js'

// 策略回測（#23、#35）：預設策略＋參數，預設計入手續費 0.1425% 與證交稅（可關閉）。
// 指標以 from 之前的資料暖身，只在 [from, to] 內下單。

const shiftDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const param = () => z.coerce.number().int().optional()

const Query = z
  .object({
    stockId: StockId,
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
    strategy: z.enum(STRATEGY_KEYS).default('ma_cross'),
    // 各策略參數（未用到的忽略；未給用策略預設值）
    fast: param(), slow: param(), signal: param(), period: param(),
    entryDays: param(), exitDays: param(), buyBelow: param(), sellAbove: param(),
    initialCapital: z.coerce.number().min(10_000).max(1e10).default(1_000_000),
    fees: z.enum(['true', 'false']).default('true').transform((v) => v === 'true').describe('是否計入手續費與證交稅'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from 不可晚於 to', path: ['to'] })

const Trade = z.object({
  entryDate: z.string(), entryPrice: z.number(), exitDate: z.string(), exitPrice: z.number(),
  shares: z.number(), fees: z.number().describe('該筆買賣手續費＋證交稅'), returnPct: z.number().describe('扣除費用後，%'),
})

const route = createRoute({
  method: 'get',
  path: '/backtest',
  request: { query: Query },
  responses: {
    200: json(
      z.object({
        stockId: z.string(),
        from: z.string().nullable(),
        to: z.string().nullable(),
        strategy: z.enum(STRATEGY_KEYS),
        params: z.record(z.string(), z.number()),
        fees: z.boolean(),
        trades: z.array(Trade),
        tradeCount: z.number(),
        winRate: z.number().describe('%'),
        totalReturnPct: z.number(),
        maxDrawdownPct: z.number().describe('權益曲線最大回落（負值，%）'),
        finalCapital: z.number(),
        totalFees: z.number(),
      }),
      '回測結果',
    ),
    400: json(ErrorBody, '參數錯誤'),
    404: json(ErrorBody, '查無股票'),
  },
})

const strategiesRoute = createRoute({
  method: 'get',
  path: '/backtest/strategies',
  responses: {
    200: json(z.array(z.object({
      key: z.enum(STRATEGY_KEYS),
      label: z.string(),
      params: z.array(z.object({ key: z.string(), label: z.string(), default: z.number(), min: z.number(), max: z.number() })),
    })), '可用策略與參數範圍'),
  },
})
const strategyList = STRATEGY_KEYS.map((key) => ({
  key,
  label: STRATEGIES[key].label,
  params: Object.entries(STRATEGIES[key].params).map(([k, spec]) => ({ key: k, ...spec })),
}))

export function registerBacktestRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(strategiesRoute, (c) => c.json(strategyList, 200))

  app.openapi(route, async (c) => {
    const q = c.req.valid('query')
    const { fast, slow, signal, period, entryDays, exitDays, buyBelow, sellAbove } = q
    const params = resolveParams(q.strategy, { fast, slow, signal, period, entryDays, exitDays, buyBelow, sellAbove })
    if (typeof params === 'string') return c.json({ error: params }, 400)
    const r = await cached(`backtest:${JSON.stringify({ ...q, params })}`, async () => {
      if (!(await findActiveStock(db, q.stockId))) return NOT_FOUND
      // 有 from 時只多讀暖身所需的資料（K 棒數 × 1.5 個日曆日＋緩衝），避免掃全部 chunk
      const warmDays = Math.ceil(warmupBars(q.strategy, params) * 1.5) + 14
      const rows = await db
        .select({ date: dailyQuotes.date, open: dailyQuotes.open, high: dailyQuotes.high, low: dailyQuotes.low, close: dailyQuotes.close })
        .from(dailyQuotes)
        .where(and(
          eq(dailyQuotes.stockId, q.stockId),
          q.to ? lte(dailyQuotes.date, q.to) : undefined,
          q.from ? gte(dailyQuotes.date, shiftDays(q.from, -warmDays)) : undefined,
        ))
        .orderBy(asc(dailyQuotes.date))
      const bars = rows.map((b) => ({
        date: b.date, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close),
      }))
      return {
        data: {
          stockId: q.stockId, from: q.from ?? null, to: q.to ?? null,
          strategy: q.strategy, params, fees: q.fees,
          ...runBacktest({
            stockId: q.stockId, bars, strategy: q.strategy, params, capital: q.initialCapital, fees: q.fees, from: q.from,
          }),
        },
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(q.stockId), 404) : c.json(r.data, 200)
  })
}
