import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { cached, ErrorBody, json } from './shared.js'

// 選股器（#21）：行情籌碼、技術趨勢、基本面三面向，條件全部選填、以 AND 組合。
// 行情、籌碼、技術、RS 取最新交易日；估值、財報、月營收、大戶持股取各股最新一期。
// 單位：成交量、外資／投信淨買超以「張」（股 / 1000）；融資增減原本即為張。

const n = () => z.number().finite().optional()
const pct = () => z.number().min(-1000).max(1000).optional()

const SORT = {
  changePct: sql`change_pct`,
  volume: sql`volume`,
  close: sql`close`,
  foreignNet: sql`foreign_net`,
  rsScore: sql`rs_score`,
  pe: sql`pe`,
  dividendYield: sql`dividend_yield`,
  grossMargin: sql`gross_margin`,
  revenueYoy: sql`revenue_yoy`,
  dividendYears: sql`dividend_years`,
} as const

const Filter = z
  .object({
    market: z.enum(['TWSE', 'TPEX', 'ALL']).optional(),
    sector: z.string().max(50).optional(),
    priceMin: z.number().min(0).optional(),
    priceMax: z.number().min(0).optional(),
    changeMin: pct(),
    changeMax: pct(),
    volumeMin: z.number().min(0).optional().describe('張'),
    foreignNetMin: n().describe('張'),
    trustNetMin: n().describe('張'),
    marginChangeMin: n().describe('張'),
    bullishAlignment: z.boolean().optional().describe('MA5 > MA10 > MA20 > MA60'),
    aboveMa20: z.boolean().optional(),
    aboveMa60: z.boolean().optional(),
    rsMin: z.number().int().min(1).max(99).optional(),
    peMin: n(),
    peMax: n(),
    pbMax: n(),
    yieldMin: pct(),
    grossMarginMin: pct(),
    revenueYoyMin: pct(),
    dividendYearsMin: z.number().int().min(1).max(50).optional(),
    bigHolderMin: z.number().min(0).max(100).optional(),
    sortBy: z.enum(Object.keys(SORT) as [keyof typeof SORT, ...(keyof typeof SORT)[]]).default('volume'),
    order: z.enum(['asc', 'desc']).default('desc'),
    limit: z.number().int().min(1).max(500).default(200),
  })
  .refine((f) => f.priceMin == null || f.priceMax == null || f.priceMin <= f.priceMax, {
    message: '股價下限不能大於上限', path: ['priceMax'],
  })
  .refine((f) => f.changeMin == null || f.changeMax == null || f.changeMin <= f.changeMax, {
    message: '漲跌幅下限不能大於上限', path: ['changeMax'],
  })
  .refine((f) => f.peMin == null || f.peMax == null || f.peMin <= f.peMax, {
    message: '本益比下限不能大於上限', path: ['peMax'],
  })
type Filter = z.infer<typeof Filter>

const Item = z.object({
  stockId: z.string(),
  stockName: z.string(),
  market: z.string(),
  sector: z.string().nullable(),
  close: z.number(),
  changePct: z.number().nullable(),
  volume: z.number().describe('張'),
  foreignNet: z.number().nullable().describe('張'),
  trustNet: z.number().nullable().describe('張'),
  marginChange: z.number().nullable().describe('張'),
  rsScore: z.number().nullable(),
  bullishAlignment: z.boolean(),
  aboveMa20: z.boolean().nullable(),
  aboveMa60: z.boolean().nullable(),
  pe: z.number().nullable(),
  pb: z.number().nullable(),
  dividendYield: z.number().nullable(),
  grossMargin: z.number().nullable(),
  revenueYoy: z.number().nullable(),
  dividendYears: z.number(),
  bigHolderPct: z.number().nullable(),
})

const route = createRoute({
  method: 'post',
  path: '/screener',
  request: { body: { content: { 'application/json': { schema: Filter } } } },
  responses: {
    200: json(z.object({ total: z.number(), items: z.array(Item) }), '符合條件的股票（total 為未截斷的筆數）'),
    400: json(ErrorBody, '參數錯誤'),
  },
})

/** 每個條件 → SQL 片段；未指定的條件不產生片段 */
function conditions(f: Filter): SQL[] {
  const c: SQL[] = []
  const add = (v: unknown, frag: SQL) => { if (v !== undefined) c.push(frag) }
  if (f.market && f.market !== 'ALL') c.push(sql`market = ${f.market}`)
  add(f.sector, sql`sector = ${f.sector}`)
  add(f.priceMin, sql`close >= ${f.priceMin}`)
  add(f.priceMax, sql`close <= ${f.priceMax}`)
  add(f.changeMin, sql`change_pct >= ${f.changeMin}`)
  add(f.changeMax, sql`change_pct <= ${f.changeMax}`)
  add(f.volumeMin, sql`volume >= ${f.volumeMin}`)
  add(f.foreignNetMin, sql`foreign_net >= ${f.foreignNetMin}`)
  add(f.trustNetMin, sql`trust_net >= ${f.trustNetMin}`)
  add(f.marginChangeMin, sql`margin_change >= ${f.marginChangeMin}`)
  add(f.bullishAlignment, sql`bullish_alignment = ${f.bullishAlignment}`)
  add(f.aboveMa20, sql`above_ma20 = ${f.aboveMa20}`)
  add(f.aboveMa60, sql`above_ma60 = ${f.aboveMa60}`)
  add(f.rsMin, sql`rs_score >= ${f.rsMin}`)
  add(f.peMin, sql`pe >= ${f.peMin}`)
  add(f.peMax, sql`pe <= ${f.peMax}`)
  add(f.pbMax, sql`pb <= ${f.pbMax}`)
  add(f.yieldMin, sql`dividend_yield >= ${f.yieldMin}`)
  add(f.grossMarginMin, sql`gross_margin >= ${f.grossMarginMin}`)
  add(f.revenueYoyMin, sql`revenue_yoy >= ${f.revenueYoyMin}`)
  add(f.dividendYearsMin, sql`dividend_years >= ${f.dividendYearsMin}`)
  add(f.bigHolderMin, sql`big_holder_pct >= ${f.bigHolderMin}`)
  return c
}

// 比較時 NULL 一律不成立 → 缺資料的股票不會被誤判為通過。
// hypertable 一律帶常數日期條件，讓 TimescaleDB 在規劃時排除其他 chunk（否則會鎖住上百個 chunk）。
const base = (d: string) => sql`
  WITH dy AS (
    SELECT stock_id, dividend_year::int AS y FROM stocks.dividends
    WHERE dividend_year ~ '^[0-9]+$'
    GROUP BY 1, 2 HAVING SUM(COALESCE(cash_dividend, 0) + COALESCE(stock_dividend, 0)) > 0
  ),
  g AS (SELECT stock_id, y, y + ROW_NUMBER() OVER (PARTITION BY stock_id ORDER BY y DESC) AS grp FROM dy),
  top AS (SELECT DISTINCT ON (stock_id) stock_id, grp FROM g ORDER BY stock_id, y DESC),
  streak AS (SELECT g.stock_id, COUNT(*)::int AS years FROM g JOIN top USING (stock_id, grp) GROUP BY g.stock_id),
  base AS (
    SELECT s.id, s.name, s.market::text AS market, s.sector,
      q.close::float8 AS close, q.change_pct::float8 AS change_pct, (q.volume / 1000)::float8 AS volume,
      (i.foreign_net / 1000)::float8 AS foreign_net, (i.trust_net / 1000)::float8 AS trust_net,
      m.margin_change::float8 AS margin_change,
      ms.rs_score::int AS rs_score,
      COALESCE(ti.ma5 > ti.ma10 AND ti.ma10 > ti.ma20 AND ti.ma20 > ti.ma60, FALSE) AS bullish_alignment,
      q.close > ti.ma20 AS above_ma20,
      q.close > ti.ma60 AS above_ma60,
      v.pe::float8 AS pe, v.pb::float8 AS pb, v.dividend_yield::float8 AS dividend_yield,
      f.gross_margin::float8 AS gross_margin, r.yoy_pct::float8 AS revenue_yoy,
      COALESCE(st.years, 0) AS dividend_years, sd.big_holder_pct::float8 AS big_holder_pct
    FROM stocks.stocks s
    JOIN stocks.daily_quotes q ON q.stock_id = s.id AND q.date = ${d}
    LEFT JOIN stocks.institutional_trading i ON i.stock_id = s.id AND i.date = ${d}
    LEFT JOIN stocks.margin_trading m ON m.stock_id = s.id AND m.date = ${d}
    LEFT JOIN stocks.technical_indicators ti ON ti.stock_id = s.id AND ti.date = ${d}
    LEFT JOIN stocks.market_strength ms ON ms.stock_id = s.id AND ms.date = ${d}
    LEFT JOIN LATERAL (
      SELECT pe, pb, dividend_yield FROM stocks.valuations
      WHERE stock_id = s.id AND date BETWEEN ${d}::date - 30 AND ${d} ORDER BY date DESC LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE WHEN revenue > 0 THEN ROUND(gross_profit * 100.0 / revenue, 2) END AS gross_margin
      FROM stocks.financial_statements WHERE stock_id = s.id ORDER BY year DESC, quarter DESC LIMIT 1
    ) f ON TRUE
    LEFT JOIN LATERAL (
      SELECT yoy_pct FROM stocks.monthly_revenue WHERE stock_id = s.id ORDER BY year_month DESC LIMIT 1
    ) r ON TRUE
    LEFT JOIN LATERAL (
      SELECT big_holder_pct FROM stocks.shareholder_dispersion
      WHERE stock_id = s.id AND date BETWEEN ${d}::date - 60 AND ${d} ORDER BY date DESC LIMIT 1
    ) sd ON TRUE
    LEFT JOIN streak st ON st.stock_id = s.id
    WHERE s.is_active
  )`

type Row = {
  id: string; name: string; market: string; sector: string | null
  close: number; change_pct: number | null; volume: number
  foreign_net: number | null; trust_net: number | null; margin_change: number | null
  rs_score: number | null; bullish_alignment: boolean; above_ma20: boolean | null; above_ma60: boolean | null
  pe: number | null; pb: number | null; dividend_yield: number | null
  gross_margin: number | null; revenue_yoy: number | null; dividend_years: number; big_holder_pct: number | null
  total: string
}

export function registerScreenerRoutes(app: OpenAPIHono, db: Db) {
  app.openapi(route, async (c) => {
    const f = c.req.valid('json')
    const where = conditions(f)
    const r = await cached(`screener:${JSON.stringify(f)}`, async () => {
      const [latest] = await db.execute<{ d: string | null }>(sql`SELECT MAX(date)::text AS d FROM stocks.daily_quotes`)
      if (!latest?.d) return { total: 0, items: [] }
      const rows = await db.execute<Row>(sql`
        ${base(latest.d)}
        SELECT *, COUNT(*) OVER () AS total FROM base
        ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
        ORDER BY ${SORT[f.sortBy]} ${f.order === 'asc' ? sql`ASC` : sql`DESC`} NULLS LAST, id
        LIMIT ${f.limit}`)
      return {
        total: rows[0] ? Number(rows[0].total) : 0,
        items: rows.map((x) => ({
          stockId: x.id, stockName: x.name, market: x.market, sector: x.sector,
          close: x.close, changePct: x.change_pct, volume: x.volume,
          foreignNet: x.foreign_net, trustNet: x.trust_net, marginChange: x.margin_change,
          rsScore: x.rs_score, bullishAlignment: x.bullish_alignment, aboveMa20: x.above_ma20, aboveMa60: x.above_ma60,
          pe: x.pe, pb: x.pb, dividendYield: x.dividend_yield,
          grossMargin: x.gross_margin, revenueYoy: x.revenue_yoy,
          dividendYears: x.dividend_years, bigHolderPct: x.big_holder_pct,
        })),
      }
    })
    return c.json(r, 200)
  })
}
