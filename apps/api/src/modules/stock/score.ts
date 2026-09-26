import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, gte } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import {
  balanceSheets, dailyQuotes, dividends, financialStatements, monthlyRevenue, valuations,
} from '../../db/schema/stocks.js'
import { cached, ErrorBody, findActiveStock, IdParam, json, NOT_FOUND, notFoundBody, num } from './shared.js'

// 財務體質評分（#22）：五構面各 0–100 分（線性換算、超出範圍截斷），缺資料的構面不列入並重新分配權重。
//   獲利能力 25：TTM ROE（淨利 / 最新權益），無資產負債表時改用 TTM 淨利率；0%→0、20%→100
//   成長力   20：近 3 個月營收年增平均；-20%→0、+30%→100
//   安全性   20：近 8 季 EPS 為正的比例、權益比（20%→0、60%→100）取平均
//   股利     20：連續配息年數；0→0、10 年→100
//   估值     15：本益比 30→0、10→100；無本益比用股價淨值比 4→0、1→100；近四季虧損 0 分
// 可評構面少於 3 個視為資料不足。等第：A ≥ 80、B ≥ 65、C ≥ 50、D ≥ 35、其餘 F。

const MIN_DIMENSIONS = 3
const Breakdown = z.object({ label: z.string(), score: z.number(), weight: z.number() })

const route = createRoute({
  method: 'get',
  path: '/stocks/{id}/score',
  request: { params: IdParam },
  responses: {
    200: json(
      z.object({
        stockId: z.string(),
        composite: z.number(),
        grade: z.enum(['A', 'B', 'C', 'D', 'F']),
        breakdown: z.array(Breakdown),
      }),
      '財務體質評分',
    ),
    404: json(ErrorBody, '查無股票或資料不足'),
  },
})

const round1 = (v: number) => Math.round(v * 10) / 10
/** 線性換算為 0–100；lo 可大於 hi（數值越低越好） */
const lin = (v: number, lo: number, hi: number) => round1(Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)))
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

const grade = (s: number) => (s >= 80 ? 'A' : s >= 65 ? 'B' : s >= 50 ? 'C' : s >= 35 ? 'D' : 'F') as 'A' | 'B' | 'C' | 'D' | 'F'

type Quarter = { revenue: number | null; netIncome: number | null; eps: number | null }

export type ScoreInput = {
  quarters: Quarter[] // 依時間升冪
  equity: number | null
  assets: number | null
  revenueYoy: number[] // 近 3 個月
  dividendYears: number
  pe: number | null
  pb: number | null
}

/** 回各構面分數；null 表示該構面沒有資料 */
export function scoreDimensions(x: ScoreInput) {
  const last4 = x.quarters.slice(-4)
  const ttm = last4.length === 4
    ? {
        net: last4.every((q) => q.netIncome != null) ? last4.reduce((s, q) => s + q.netIncome!, 0) : null,
        revenue: last4.every((q) => q.revenue != null) ? last4.reduce((s, q) => s + q.revenue!, 0) : null,
        eps: last4.every((q) => q.eps != null) ? last4.reduce((s, q) => s + q.eps!, 0) : null,
      }
    : null

  let profit: number | null = null
  if (ttm?.net != null && x.equity != null && x.equity > 0) profit = lin((ttm.net / x.equity) * 100, 0, 20)
  else if (ttm?.net != null && ttm.revenue) profit = lin((ttm.net / ttm.revenue) * 100, 0, 20)

  const yoy = avg(x.revenueYoy)
  const growth = yoy == null ? null : lin(yoy, -20, 30)

  const eps8 = x.quarters.slice(-8).filter((q) => q.eps != null)
  const safetyParts = [
    ...(eps8.length >= 4 ? [(eps8.filter((q) => q.eps! > 0).length / eps8.length) * 100] : []),
    ...(x.equity != null && x.assets ? [lin((x.equity / x.assets) * 100, 20, 60)] : []),
  ]
  const safetyAvg = avg(safetyParts)
  const safety = safetyAvg == null ? null : round1(safetyAvg)

  const dividend = lin(x.dividendYears, 0, 10)

  let valuation: number | null = null
  if (ttm?.eps != null && ttm.eps <= 0) valuation = 0
  else if (x.pe != null) valuation = lin(x.pe, 30, 10)
  else if (x.pb != null) valuation = lin(x.pb, 4, 1)

  return [
    { label: '獲利能力', score: profit, weight: 25 },
    { label: '成長力', score: growth, weight: 20 },
    { label: '安全性', score: safety, weight: 20 },
    { label: '股利', score: dividend, weight: 20 },
    { label: '估值', score: valuation, weight: 15 },
  ]
}

/** 最近有配息的年度往回連續幾年（與前端、選股器同定義） */
function consecutiveYears(rows: { year: string; amount: number }[]): number {
  const byYear = new Map<number, number>()
  for (const r of rows) {
    const y = Number(r.year)
    if (Number.isInteger(y)) byYear.set(y, (byYear.get(y) ?? 0) + r.amount)
  }
  const years = [...byYear].filter(([, v]) => v > 0).map(([y]) => y).sort((a, b) => b - a)
  let n = years.length ? 1 : 0
  while (n < years.length && years[n] === years[n - 1]! - 1) n++
  return n
}

export function registerScoreRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(route, async (c) => {
    const { id } = c.req.valid('param')
    const r = await cached(`score:${id}`, async () => {
      if (!(await findActiveStock(db, id))) return NOT_FOUND
      const [quote] = await db.select({ date: dailyQuotes.date }).from(dailyQuotes)
        .where(eq(dailyQuotes.stockId, id)).orderBy(desc(dailyQuotes.date)).limit(1)
      const since = quote ? new Date(Date.parse(quote.date) - 30 * 86_400_000).toISOString().slice(0, 10) : '1900-01-01'
      const [fin, [bs], rev, divs, [val]] = await Promise.all([
        db.select({ revenue: financialStatements.revenue, netIncome: financialStatements.netIncome, eps: financialStatements.eps })
          .from(financialStatements).where(eq(financialStatements.stockId, id))
          .orderBy(asc(financialStatements.year), asc(financialStatements.quarter)),
        db.select({ equity: balanceSheets.totalEquity, assets: balanceSheets.totalAssets })
          .from(balanceSheets).where(eq(balanceSheets.stockId, id))
          .orderBy(desc(balanceSheets.year), desc(balanceSheets.quarter)).limit(1),
        db.select({ yoy: monthlyRevenue.yoyPct }).from(monthlyRevenue).where(eq(monthlyRevenue.stockId, id))
          .orderBy(desc(monthlyRevenue.yearMonth)).limit(3),
        db.select({ year: dividends.dividendYear, cash: dividends.cashDividend, stock: dividends.stockDividend })
          .from(dividends).where(eq(dividends.stockId, id)),
        // 估值帶日期下限，避免掃過全部 chunk
        db.select({ pe: valuations.pe, pb: valuations.pb }).from(valuations)
          .where(and(eq(valuations.stockId, id), gte(valuations.date, since)))
          .orderBy(desc(valuations.date)).limit(1),
      ])
      const dims = scoreDimensions({
        quarters: fin.map((f) => ({ revenue: f.revenue, netIncome: f.netIncome, eps: num(f.eps) })),
        equity: bs?.equity ?? null,
        assets: bs?.assets ?? null,
        revenueYoy: rev.map((m) => num(m.yoy)).filter((v): v is number => v != null),
        dividendYears: consecutiveYears(divs.map((d) => ({ year: d.year, amount: (num(d.cash) ?? 0) + (num(d.stock) ?? 0) }))),
        pe: num(val?.pe ?? null),
        pb: num(val?.pb ?? null),
      }).filter((d): d is { label: string; score: number; weight: number } => d.score != null)
      if (dims.length < MIN_DIMENSIONS) return { insufficient: true as const }
      const w = dims.reduce((s, d) => s + d.weight, 0)
      const composite = Math.round(dims.reduce((s, d) => s + d.score * d.weight, 0) / w)
      return { data: { stockId: id, composite, grade: grade(composite), breakdown: dims } }
    })
    if ('notFound' in r) return c.json(notFoundBody(id), 404)
    if ('insufficient' in r) return c.json({ error: `${id} 財務資料不足，無法評分` }, 404)
    return c.json(r.data, 200)
  })
}
