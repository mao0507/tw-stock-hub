import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { dailyQuotes } from '../../db/schema/stocks.js'
import { CalendarDate, cached, ErrorBody, findActiveStock, json, NOT_FOUND, notFoundBody, StockId } from './shared.js'

// 均線交叉回測（#23）：快線上穿慢線（黃金交叉）→ 次日開盤全數買進（整股）；
// 下穿（死亡交叉）→ 次日開盤賣出，避免同根 K 棒 look-ahead。期末未平倉以最後收盤結算。
// 不計手續費與稅；均線以 from 之前的資料暖身，只在 [from, to] 內下單。

const round2 = (v: number) => Math.round(v * 100) / 100
const shiftDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

const Query = z
  .object({
    stockId: StockId,
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
    fastPeriod: z.coerce.number().int().min(2).max(120).default(5),
    slowPeriod: z.coerce.number().int().min(3).max(250).default(20),
    initialCapital: z.coerce.number().min(10_000).max(1e10).default(1_000_000),
  })
  .refine((q) => q.fastPeriod < q.slowPeriod, { message: '快線天數必須小於慢線天數', path: ['fastPeriod'] })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from 不可晚於 to', path: ['to'] })

const Trade = z.object({
  entryDate: z.string(), entryPrice: z.number(), exitDate: z.string(), exitPrice: z.number(), returnPct: z.number(),
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
        fastPeriod: z.number(),
        slowPeriod: z.number(),
        trades: z.array(Trade),
        tradeCount: z.number(),
        winRate: z.number().describe('%'),
        totalReturnPct: z.number(),
        maxDrawdownPct: z.number().describe('權益曲線最大回落（負值，%）'),
        finalCapital: z.number(),
      }),
      '回測結果',
    ),
    400: json(ErrorBody, '參數錯誤'),
    404: json(ErrorBody, '查無股票'),
  },
})

type Bar = { date: string; open: number; close: number }

function sma(bars: Bar[], period: number): (number | null)[] {
  let sum = 0
  return bars.map((b, i) => {
    sum += b.close
    if (i >= period) sum -= bars[i - period]!.close
    return i >= period - 1 ? sum / period : null
  })
}

export function runBacktest(bars: Bar[], fast: number, slow: number, capital: number, from?: string) {
  const f = sma(bars, fast)
  const s = sma(bars, slow)
  const above = (i: number) => f[i] != null && s[i] != null && f[i]! > s[i]!
  let cash = capital
  let shares = 0
  let entry: { date: string; price: number } | null = null
  const trades: z.infer<typeof Trade>[] = []
  let peak = capital
  let maxDd = 0
  const close = (date: string, price: number) => {
    cash += shares * price
    trades.push({
      entryDate: entry!.date, entryPrice: entry!.price, exitDate: date, exitPrice: price,
      returnPct: round2((price / entry!.price - 1) * 100),
    })
    shares = 0
    entry = null
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!
    // 前一天收盤出現訊號 → 今天開盤成交
    const prev = i - 1
    if (prev >= 1 && (!from || bars[prev]!.date >= from)) {
      const golden = above(prev) && !above(prev - 1) && s[prev - 1] != null
      const death = !above(prev) && above(prev - 1)
      if (golden && !entry) {
        shares = Math.floor(cash / bar.open)
        if (shares > 0) {
          cash -= shares * bar.open
          entry = { date: bar.date, price: bar.open }
        }
      } else if (death && entry) {
        close(bar.date, bar.open)
      }
    }
    const equity = cash + shares * bar.close
    peak = Math.max(peak, equity)
    maxDd = Math.min(maxDd, equity / peak - 1)
  }
  const last = bars.at(-1)
  if (entry && last) close(last.date, last.close)

  const wins = trades.filter((x) => x.exitPrice > x.entryPrice).length
  return {
    trades,
    tradeCount: trades.length,
    winRate: trades.length ? round2((wins / trades.length) * 100) : 0,
    totalReturnPct: round2((cash / capital - 1) * 100),
    maxDrawdownPct: round2(maxDd * 100),
    finalCapital: round2(cash),
  }
}

export function registerBacktestRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(route, async (c) => {
    const q = c.req.valid('query')
    const r = await cached(`backtest:${JSON.stringify(q)}`, async () => {
      if (!(await findActiveStock(db, q.stockId))) return NOT_FOUND
      const rows = await db
        .select({ date: dailyQuotes.date, open: dailyQuotes.open, close: dailyQuotes.close })
        .from(dailyQuotes)
        .where(and(
          eq(dailyQuotes.stockId, q.stockId),
          q.to ? lte(dailyQuotes.date, q.to) : undefined,
          // 有 from 時只多讀暖身所需的資料（慢線天數 × 2 個日曆日綽綽有餘），避免掃全部 chunk
          q.from ? gte(dailyQuotes.date, shiftDays(q.from, -q.slowPeriod * 2 - 14)) : undefined,
        ))
        .orderBy(asc(dailyQuotes.date))
      const bars = rows.map((b) => ({ date: b.date, open: Number(b.open), close: Number(b.close) }))
      return {
        data: {
          stockId: q.stockId, from: q.from ?? null, to: q.to ?? null,
          fastPeriod: q.fastPeriod, slowPeriod: q.slowPeriod,
          ...runBacktest(bars, q.fastPeriod, q.slowPeriod, q.initialCapital, q.from),
        },
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(q.stockId), 404) : c.json(r.data, 200)
  })
}
