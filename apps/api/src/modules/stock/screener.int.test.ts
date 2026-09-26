// #21 選股器：行情籌碼、技術趨勢、基本面三面向
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Item = {
  stockId: string
  close: number
  changePct: number | null
  volume: number
  foreignNet: number | null
  trustNet: number | null
  marginChange: number | null
  rsScore: number | null
  bullishAlignment: boolean
  pe: number | null
  dividendYield: number | null
  grossMargin: number | null
  revenueYoy: number | null
  dividendYears: number
  bigHolderPct: number | null
}
type Res = { total: number; items: Item[] }

const screen = async (body: Record<string, unknown>) => {
  const res = await app.request('/api/screener', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Res }
}
const ids = async (body: Record<string, unknown>) => (await screen(body)).body.items.map((i) => i.stockId).sort()

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  const a = t.admin
  await a`
    INSERT INTO stocks.stocks (id, name, market, sector, is_active) VALUES
      ('7401', '強勢股', 'TWSE', '半導體類指數', TRUE),
      ('7402', '弱勢股', 'TPEX', '電子類指數', TRUE),
      ('7403', '空資料', 'TWSE', NULL, TRUE),
      ('7404', '已下市', 'TWSE', NULL, FALSE)`
  // 舊日期的行情不應被採用
  await a`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct) VALUES
      ('2026-09-23', '7401', 1, 1, 1, 1, 1, 1, 0, -50),
      ('2026-09-24', '7401', 108, 111, 107, 110, 2000000, 1, 2.16, 2),
      ('2026-09-24', '7402', 51, 51, 49, 50, 500000, 1, -0.5, -1),
      ('2026-09-24', '7403', 20, 20, 20, 20, 100000, 1, 0, 0),
      ('2026-09-24', '7404', 9, 9, 9, 9, 9000000, 1, 0, 0)`
  await a`
    INSERT INTO stocks.institutional_trading
      (date, stock_id, foreign_buy, foreign_sell, foreign_net, trust_buy, trust_sell, trust_net,
       dealer_buy, dealer_sell, dealer_net, total_net) VALUES
      ('2026-09-24', '7401', 0, 0, 500000, 0, 0, 100000, 0, 0, 0, 600000),
      ('2026-09-24', '7402', 0, 0, -100000, 0, 0, 0, 0, 0, 0, -100000)`
  await a`
    INSERT INTO stocks.margin_trading
      (date, stock_id, margin_balance, margin_change, margin_limit, short_balance, short_change, short_limit) VALUES
      ('2026-09-24', '7401', 1000, 50, 0, 10, 0, 0),
      ('2026-09-24', '7402', 1000, -20, 0, 10, 0, 0)`
  await a`
    INSERT INTO stocks.technical_indicators (date, stock_id, ma5, ma10, ma20, ma60) VALUES
      ('2026-09-24', '7401', 106, 103, 100, 95),
      ('2026-09-24', '7402', 51, 53, 55, 60)`
  await a`
    INSERT INTO stocks.market_strength (date, stock_id, rs_score, weighted_return) VALUES
      ('2026-09-24', '7401', 90, 0.3), ('2026-09-24', '7402', 30, -0.1)`
  await a`
    INSERT INTO stocks.valuations (date, stock_id, pe, pb, dividend_yield) VALUES
      ('2026-09-24', '7401', 15, 2, 4), ('2026-09-24', '7402', 40, 5, 1)`
  await a`
    INSERT INTO stocks.financial_statements (stock_id, year, quarter, revenue, gross_profit) VALUES
      ('7401', 2026, 1, 100, 10), ('7401', 2026, 2, 100, 40), ('7402', 2026, 2, 100, 10)`
  await a`
    INSERT INTO stocks.monthly_revenue (stock_id, year_month, revenue, yoy_pct) VALUES
      ('7401', '11507', 1, -50), ('7401', '11508', 1, 20), ('7402', '11508', 1, -5)`
  await a`
    INSERT INTO stocks.dividends (stock_id, dividend_year, period, cash_dividend, stock_dividend) VALUES
      ('7401', '112', '1', 1, 0), ('7401', '113', '1', 1, 0), ('7401', '114', '1', 1, 0),
      ('7402', '112', '1', 1, 0), ('7402', '114', '1', 1, 0), ('7402', '113', '1', 0, 0)`
  await a`
    INSERT INTO stocks.shareholder_dispersion (date, stock_id, big_holder_pct) VALUES
      ('2026-09-18', '7401', 60), ('2026-09-18', '7402', 30)`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('POST /screener', () => {
  it('無條件回全部上市櫃中的股票（排除下市），採最新交易日', async () => {
    const { status, body } = await screen({})
    expect(status).toBe(200)
    expect(body.total).toBe(3)
    expect(body.items.map((i) => i.stockId).sort()).toEqual(['7401', '7402', '7403'])
    expect(body.items.find((i) => i.stockId === '7401')).toMatchObject({
      close: 110, changePct: 2, volume: 2000, foreignNet: 500, trustNet: 100, marginChange: 50,
      rsScore: 90, bullishAlignment: true, pe: 15, dividendYield: 4,
      grossMargin: 40, revenueYoy: 20, dividendYears: 3, bigHolderPct: 60,
    })
    expect(body.items.find((i) => i.stockId === '7403')).toMatchObject({
      rsScore: null, bullishAlignment: false, pe: null, grossMargin: null, dividendYears: 0,
    })
  })

  it('行情籌碼條件：市場、產業、價格、漲跌幅、成交量、外資／投信、融資', async () => {
    expect(await ids({ market: 'TPEX' })).toEqual(['7402'])
    expect(await ids({ sector: '半導體類指數' })).toEqual(['7401'])
    expect(await ids({ priceMin: 30, priceMax: 100 })).toEqual(['7402'])
    expect(await ids({ changeMin: 0 })).toEqual(['7401', '7403'])
    expect(await ids({ volumeMin: 1000 })).toEqual(['7401'])
    expect(await ids({ foreignNetMin: 200 })).toEqual(['7401'])
    expect(await ids({ trustNetMin: 50 })).toEqual(['7401'])
    expect(await ids({ marginChangeMin: 0 })).toEqual(['7401'])
  })

  it('技術趨勢條件：均線多頭排列、站上均線、RS 門檻', async () => {
    expect(await ids({ bullishAlignment: true })).toEqual(['7401'])
    expect(await ids({ aboveMa20: true })).toEqual(['7401'])
    expect(await ids({ aboveMa60: true })).toEqual(['7401'])
    expect(await ids({ rsMin: 50 })).toEqual(['7401'])
  })

  it('基本面條件：PE、殖利率、毛利率、營收年增、連續配息年數、大戶持股；缺資料不算通過', async () => {
    expect(await ids({ peMax: 20 })).toEqual(['7401'])
    expect(await ids({ peMin: 20 })).toEqual(['7402'])
    expect(await ids({ pbMax: 3 })).toEqual(['7401'])
    expect(await ids({ yieldMin: 3 })).toEqual(['7401'])
    expect(await ids({ grossMarginMin: 30 })).toEqual(['7401'])
    expect(await ids({ revenueYoyMin: 0 })).toEqual(['7401'])
    expect(await ids({ dividendYearsMin: 2 })).toEqual(['7401'])
    expect(await ids({ dividendYearsMin: 1 })).toEqual(['7401', '7402'])
    expect(await ids({ bigHolderMin: 50 })).toEqual(['7401'])
  })

  it('條件以 AND 組合', async () => {
    expect(await ids({ market: 'TWSE', rsMin: 50, yieldMin: 3 })).toEqual(['7401'])
    expect(await ids({ market: 'TPEX', rsMin: 50 })).toEqual([])
  })

  it('排序與筆數上限；total 為全部符合筆數', async () => {
    const { body } = await screen({ sortBy: 'changePct', order: 'asc', limit: 2 })
    expect(body.total).toBe(3)
    expect(body.items.map((i) => i.stockId)).toEqual(['7402', '7403'])
  })

  it('參數錯誤回 400', async () => {
    expect((await screen({ priceMin: 100, priceMax: 10 })).status).toBe(400)
    expect((await screen({ rsMin: 120 })).status).toBe(400)
    expect((await screen({ sortBy: 'nope' })).status).toBe(400)
  })
})
