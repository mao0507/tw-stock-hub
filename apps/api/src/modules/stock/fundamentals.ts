import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import {
  balanceSheets, dailyQuotes, dividends, etfHoldings, etfInfo, financialStatements, monthlyRevenue, valuations,
} from '../../db/schema/stocks.js'
import {
  type BsRow, calcFill, type DividendRow, type FinRow, latestAnnualCash, payoutRatios, pct, quarterlyMetrics, round2,
  trailingCash, ttmEps as calcTtmEps,
} from './fundamentals-calc.js'
import { cached, ErrorBody, findActiveStock, IdParam, json, NOT_FOUND, notFoundBody, num } from './shared.js'

// 個股基本面（#6）：月營收、財報、進階指標、股利（含填息）、估值、ETF 成分股

const isEtf = (id: string) => /^00/.test(id)
const NumOrNull = z.number().nullable()
const limitQuery = (def: number, max: number) =>
  z.object({ limit: z.coerce.number().int().min(1).max(max).default(def) })

const routes = {
  revenue: createRoute({
    method: 'get',
    path: '/stocks/{id}/revenue',
    request: { params: IdParam, query: limitQuery(36, 60) },
    responses: {
      200: json(
        z.array(z.object({ yearMonth: z.string(), revenue: NumOrNull, momPct: NumOrNull, yoyPct: NumOrNull, cumYoyPct: NumOrNull })),
        '月營收（由舊到新）',
      ),
      404: json(ErrorBody, '查無股票'),
    },
  }),
  financials: createRoute({
    method: 'get',
    path: '/stocks/{id}/financials',
    request: { params: IdParam, query: limitQuery(12, 20) },
    responses: {
      200: json(
        z.array(
          z.object({
            period: z.string(),
            revenue: NumOrNull,
            grossMargin: NumOrNull,
            opMargin: NumOrNull,
            netMargin: NumOrNull,
            eps: NumOrNull,
          }),
        ),
        '季財報（由舊到新）',
      ),
      404: json(ErrorBody, '查無股票'),
    },
  }),
  metrics: createRoute({
    method: 'get',
    path: '/stocks/{id}/metrics',
    request: { params: IdParam },
    responses: {
      200: json(z.object({ quarters: z.array(z.record(z.string(), z.unknown())), payouts: z.array(z.record(z.string(), z.unknown())) }), '進階指標與年度發放率'),
      404: json(ErrorBody, '查無股票'),
    },
  }),
  dividends: createRoute({
    method: 'get',
    path: '/stocks/{id}/dividends',
    request: { params: IdParam },
    responses: {
      200: json(
        z.array(
          z.object({
            year: z.string(),
            period: z.string(),
            cash: z.number(),
            stock: z.number(),
            exDate: z.string().nullable(),
            refPrice: NumOrNull,
            filled: z.boolean().nullable(),
            fillDays: NumOrNull,
            gapPct: NumOrNull,
          }),
        ),
        '股利（由新到舊，含填息）',
      ),
      404: json(ErrorBody, '查無股票'),
    },
  }),
  valuation: createRoute({
    method: 'get',
    path: '/stocks/{id}/valuation',
    request: { params: IdParam },
    responses: {
      200: json(
        z.object({
          date: z.string().nullable(),
          pe: NumOrNull,
          pb: NumOrNull,
          dividendYield: NumOrNull,
          ttmEps: NumOrNull,
          history: z.array(z.object({ date: z.string(), pe: z.number() })),
        }),
        '估值與本益比歷史',
      ),
      404: json(ErrorBody, '查無股票'),
    },
  }),
  etfHoldings: createRoute({
    method: 'get',
    path: '/stocks/{id}/etf-holdings',
    request: { params: IdParam },
    responses: { 200: json(z.record(z.string(), z.unknown()), 'ETF 成分股、產業比重、基本資料'), 404: json(ErrorBody, '查無股票') },
  }),
}

type FinFull = FinRow & { grossProfit: number | null; opIncome: number | null }

export function registerFundamentalRoutes(app: OpenAPIHono, db: Db) {
  const finRows = async (id: string): Promise<FinFull[]> => {
    const rows = await db
      .select()
      .from(financialStatements)
      .where(eq(financialStatements.stockId, id))
      .orderBy(asc(financialStatements.year), asc(financialStatements.quarter))
    return rows.map((r) => ({ ...r, eps: num(r.eps) }))
  }

  const dividendRows = async (id: string): Promise<DividendRow[]> => {
    const rows = await db
      .select({ dividendYear: dividends.dividendYear, cash: dividends.cashDividend, exDate: dividends.exDividendDate })
      .from(dividends)
      .where(eq(dividends.stockId, id))
    return rows.map((r) => ({ dividendYear: r.dividendYear, cash: num(r.cash) ?? 0, exDate: r.exDate }))
  }

  /** 查詢前確認股票存在，並套用快取；不存在回 404 */
  const withStock = <T extends object>(key: string, id: string, load: () => Promise<T>) =>
    cached(key, async () => ((await findActiveStock(db, id)) ? { data: await load() } : NOT_FOUND))

  app.openapi(routes.revenue, async (c) => {
    const { id } = c.req.valid('param')
    const { limit } = c.req.valid('query')
    const r = await withStock(`revenue:${id}:${limit}`, id, async () => {
      const rows = await db
        .select()
        .from(monthlyRevenue)
        .where(eq(monthlyRevenue.stockId, id))
        .orderBy(desc(monthlyRevenue.yearMonth))
        .limit(limit)
      return rows.reverse().map((m) => ({
        yearMonth: m.yearMonth,
        revenue: m.revenue,
        momPct: num(m.momPct),
        yoyPct: num(m.yoyPct),
        cumYoyPct: num(m.cumYoyPct),
      }))
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })

  app.openapi(routes.financials, async (c) => {
    const { id } = c.req.valid('param')
    const { limit } = c.req.valid('query')
    const r = await withStock(`financials:${id}:${limit}`, id, async () =>
      (await finRows(id)).slice(-limit).map((f) => ({
        period: `${f.year}Q${f.quarter}`,
        revenue: f.revenue,
        grossMargin: pct(f.grossProfit, f.revenue),
        opMargin: pct(f.opIncome, f.revenue),
        netMargin: pct(f.netIncome, f.revenue),
        eps: f.eps,
      })),
    )
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })

  app.openapi(routes.metrics, async (c) => {
    const { id } = c.req.valid('param')
    const r = await withStock(`metrics:${id}`, id, async () => {
      const [fin, bs, divs] = await Promise.all([
        finRows(id),
        db.select().from(balanceSheets).where(eq(balanceSheets.stockId, id)) as Promise<BsRow[]>,
        dividendRows(id),
      ])
      return { quarters: quarterlyMetrics(fin, bs), payouts: payoutRatios(divs, fin) }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })

  app.openapi(routes.dividends, async (c) => {
    const { id } = c.req.valid('param')
    const r = await withStock(`dividends:${id}`, id, async () => {
      const [rows, closes] = await Promise.all([
        db
          .select()
          .from(dividends)
          .where(eq(dividends.stockId, id))
          // 年度、期別是文字欄位：年度以數值排序，同年度依除息日，最後才依期別字串
          .orderBy(
            sql`CASE WHEN ${dividends.dividendYear} ~ '^[0-9]+$' THEN ${dividends.dividendYear}::int END DESC NULLS LAST`,
            sql`${dividends.exDividendDate} DESC NULLS LAST`,
            desc(dividends.period),
          )
          .limit(48),
        db
          .select({ date: dailyQuotes.date, close: dailyQuotes.close })
          .from(dailyQuotes)
          .where(eq(dailyQuotes.stockId, id))
          .orderBy(asc(dailyQuotes.date)),
      ])
      const series = closes.map((q) => ({ date: q.date, close: Number(q.close) }))
      return rows.map((d) => {
        const fill = d.exDividendDate ? calcFill(series, d.exDividendDate) : null
        return {
          year: d.dividendYear,
          period: d.period,
          cash: num(d.cashDividend) ?? 0,
          stock: num(d.stockDividend) ?? 0,
          exDate: d.exDividendDate,
          refPrice: fill?.refPrice ?? null,
          filled: fill?.filled ?? null,
          fillDays: fill?.fillDays ?? null,
          gapPct: fill?.gapPct ?? null,
        }
      })
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })

  app.openapi(routes.valuation, async (c) => {
    const { id } = c.req.valid('param')
    const r = await withStock(`valuation:${id}`, id, async () => {
      const [[latest], fin, history] = await Promise.all([
        db.select().from(valuations).where(eq(valuations.stockId, id)).orderBy(desc(valuations.date)).limit(1),
        finRows(id),
        db
          .select({ date: valuations.date, pe: valuations.pe })
          .from(valuations)
          .where(and(eq(valuations.stockId, id), isNotNull(valuations.pe)))
          .orderBy(desc(valuations.date))
          .limit(250),
      ])
      const ttmEps = calcTtmEps(fin)

      let pe = num(latest?.pe ?? null)
      let dividendYield = num(latest?.dividendYield ?? null)
      // 證交所估值缺值（上櫃、金融、ETF 常見）→ 以收盤價自行推算
      if (pe == null || dividendYield == null) {
        const [q] = await db
          .select({ close: dailyQuotes.close, date: dailyQuotes.date })
          .from(dailyQuotes)
          .where(eq(dailyQuotes.stockId, id))
          .orderBy(desc(dailyQuotes.date))
          .limit(1)
        const close = q ? Number(q.close) : null
        if (pe == null && close && ttmEps != null && ttmEps > 0) pe = round2(close / ttmEps)
        if (dividendYield == null && close) {
          // 優先用近 12 個月（依除息日）；沒有除息日資料才退回最近有配息年度的合計
          const divs = await dividendRows(id)
          const cash = trailingCash(divs, q!.date) ?? latestAnnualCash(divs)
          if (cash != null) dividendYield = round2((cash / close) * 100)
        }
      }
      return {
        date: latest?.date ?? null,
        pe,
        pb: num(latest?.pb ?? null),
        dividendYield,
        ttmEps: ttmEps != null ? round2(ttmEps) : null,
        history: history.reverse().map((h) => ({ date: h.date, pe: Number(h.pe) })),
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })

  app.openapi(routes.etfHoldings, async (c) => {
    const { id } = c.req.valid('param')
    const r = await withStock(`etf:${id}`, id, async () => {
      if (!isEtf(id)) return { isEtf: false, holdings: [] }
      const [rows, industries, [info]] = await Promise.all([
        db.select().from(etfHoldings).where(eq(etfHoldings.etfId, id)).orderBy(desc(etfHoldings.weight)),
        db.execute<{ sector: string | null; weight: string }>(sql`
          SELECT s.sector, SUM(e.weight) AS weight
          FROM stocks.etf_holdings e
          LEFT JOIN stocks.stocks s ON s.id = e.stock_id
          WHERE e.etf_id = ${id}
          GROUP BY s.sector
          ORDER BY SUM(e.weight) DESC`),
        db.select({ items: etfInfo.items }).from(etfInfo).where(eq(etfInfo.etfId, id)),
      ])
      return {
        isEtf: true,
        updatedDate: rows[0]?.updatedDate ?? null,
        info: (info?.items as unknown[] | null) ?? [],
        industries: industries.map((i) => ({
          sector: i.sector ? i.sector.replace('類指數', '') : '其他',
          weight: round2(Number(i.weight)),
        })),
        holdings: rows.map((h) => ({ stockId: h.stockId, stockName: h.stockName, weight: num(h.weight), shares: h.shares })),
      }
    })
    return 'notFound' in r ? c.json(notFoundBody(id), 404) : c.json(r.data, 200)
  })
}
