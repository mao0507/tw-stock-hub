// #6 個股基本面：月營收、財報、進階指標、股利（含填息）、估值、ETF 成分股
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  const a = t.admin
  await a`
    INSERT INTO stocks.stocks (id, name, market, sector, is_active) VALUES
      ('7201', '基本面甲', 'TWSE', '半導體類指數', TRUE),
      ('7202', '沒有資料', 'TWSE', NULL, TRUE),
      ('7203', '估值回推', 'TWSE', '金融', TRUE),
      ('0099', '測試ETF', 'TWSE', NULL, TRUE),
      ('0098', '空ETF', 'TWSE', NULL, TRUE)`

  for (const [ym, rev] of [['202607', 100], ['202608', 110], ['202609', 121]] as const) {
    await a`
      INSERT INTO stocks.monthly_revenue (stock_id, year_month, revenue, mom_pct, yoy_pct, cum_yoy_pct)
      VALUES ('7201', ${ym}, ${rev}, 10, 20, 15)`
  }

  // year, quarter, revenue, gross, op, pretax, net, eps, cogs, opExp, nonOp
  const fin: [number, number, number, number, number, number, number, number, number, number, number][] = [
    [2025, 1, 900, 360, 180, 200, 160, 1, 540, 180, 20],
    [2025, 2, 1000, 400, 200, 220, 180, 2, 600, 200, 20],
    [2025, 3, 1100, 440, 220, 240, 200, 2, 660, 220, 20],
    [2025, 4, 1200, 480, 240, 260, 220, 3, 720, 240, 20],
    [2026, 1, 1300, 520, 260, 280, 240, 3, 780, 260, 20],
    [2026, 2, 1400, 560, 280, 300, 260, 4, 840, 280, 20],
  ]
  for (const [y, q, rev, gp, op, pre, net, eps, cogs, opx, non] of fin) {
    await a`
      INSERT INTO stocks.financial_statements
        (stock_id, year, quarter, revenue, gross_profit, op_income, pretax_income, net_income, eps,
         cost_of_goods_sold, op_expenses, non_op_income)
      VALUES ('7201', ${y}, ${q}, ${rev}, ${gp}, ${op}, ${pre}, ${net}, ${eps}, ${cogs}, ${opx}, ${non})`
  }
  await a`
    INSERT INTO stocks.balance_sheets
      (stock_id, year, quarter, total_assets, total_equity, accounts_receivable, inventories, contract_liabilities)
    VALUES ('7201', 2026, 1, 10000, 5000, 300, 500, 100), ('7201', 2026, 2, 12000, 6000, 300, 700, 200)`

  await a`
    INSERT INTO stocks.dividends (stock_id, dividend_year, period, cash_dividend, stock_dividend, ex_dividend_date) VALUES
      ('7201', '114', '全年', 4, 0, '2025-08-01'),
      ('7201', '115', 'Q1', 2.5, 0, '2026-07-10'),
      ('7201', '115', 'Q2', 3, 0.5, '2026-09-20')`
  const closes: [string, number][] = [
    ['2026-07-08', 100], ['2026-07-09', 100], ['2026-07-10', 97], ['2026-07-13', 99],
    ['2026-07-14', 101], ['2026-09-18', 120], ['2026-09-21', 118], ['2026-09-22', 115],
  ]
  for (const [d, c] of closes) {
    await a`
      INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value)
      VALUES (${d}, '7201', ${c}, ${c}, ${c}, ${c}, 1, 1)`
  }
  await a`
    INSERT INTO stocks.valuations (date, stock_id, pe, pb, dividend_yield) VALUES
      ('2026-09-21', '7201', 15.5, 2.1, 3.2), ('2026-09-22', '7201', 16, 2.2, 3.1)`

  // 7203：估值缺值 → 以收盤價、近四季 EPS、最近年度現金股利回推
  await a`INSERT INTO stocks.valuations (date, stock_id, pe, pb, dividend_yield) VALUES ('2026-09-22', '7203', NULL, 1.1, NULL)`
  for (const q of [1, 2, 3, 4]) {
    await a`INSERT INTO stocks.financial_statements (stock_id, year, quarter, eps) VALUES ('7203', 2025, ${q}, 1.5)`
  }
  await a`INSERT INTO stocks.dividends (stock_id, dividend_year, period, cash_dividend) VALUES ('7203', '114', '全年', 4.5), ('7203', '115', '全年', 0)`
  await a`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value)
    VALUES ('2026-09-22', '7203', 90, 90, 90, 90, 1, 1)`

  await a`
    INSERT INTO stocks.etf_holdings (etf_id, stock_id, stock_name, weight, shares, updated_date) VALUES
      ('0099', '7201', '基本面甲', 30, 1000, '2026-09-20'),
      ('0099', '7203', '估值回推', 50, 2000, '2026-09-20'),
      ('0099', '9999', '不在清單', 20, NULL, '2026-09-20')`
  await a`INSERT INTO stocks.etf_info (etf_id, items, updated_date) VALUES ('0099', ${a.json([{ label: '規模', value: '100億' }])}, '2026-09-20')`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

const get = async <T>(path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as T }
}

describe('月營收', () => {
  it('由舊到新，limit 控制月數', async () => {
    expect((await get('/stocks/7201/revenue?limit=2')).body).toEqual([
      { yearMonth: '202608', revenue: 110, momPct: 10, yoyPct: 20, cumYoyPct: 15 },
      { yearMonth: '202609', revenue: 121, momPct: 10, yoyPct: 20, cumYoyPct: 15 },
    ])
  })
  it('無資料回空陣列；查無股票 404', async () => {
    expect((await get('/stocks/7202/revenue')).body).toEqual([])
    expect((await get('/stocks/0000/revenue')).status).toBe(404)
  })
})

describe('財報', () => {
  it('由舊到新，含毛利率、營益率、淨利率與 EPS', async () => {
    expect((await get('/stocks/7201/financials?limit=2')).body).toEqual([
      { period: '2026Q1', revenue: 1300, grossMargin: 40, opMargin: 20, netMargin: 18.46, eps: 3 },
      { period: '2026Q2', revenue: 1400, grossMargin: 40, opMargin: 20, netMargin: 18.57, eps: 4 },
    ])
  })
  it('無資料回空陣列', async () => {
    expect((await get('/stocks/7202/financials')).body).toEqual([])
  })
})

describe('進階指標', () => {
  it('ROE/ROA 用期初期末平均並年化；無資產負債表時為 null；年度發放率', async () => {
    const { body } = await get<{ quarters: Record<string, unknown>[]; payouts: unknown[] }>('/stocks/7201/metrics')
    expect(body.quarters.at(-1)).toEqual({
      period: '2026Q2',
      opExpenseRatio: 20,
      nonOpToPretaxPct: 6.67,
      netMargin: 18.57,
      roe: 18.91,
      roa: 9.45,
      assetTurnover: 0.51,
      equityMultiplier: 2,
      inventoryDays: 64,
      receivableDays: 19,
      contractLiabToRevenuePct: 3.57,
    })
    expect(body.quarters.find((q) => q['period'] === '2025Q4')).toMatchObject({ roe: null, roa: null, inventoryDays: null })
    expect(body.payouts).toEqual([
      { year: '115', cashDividend: 5.5, eps: null, payoutPct: null },
      { year: '114', cashDividend: 4, eps: 8, payoutPct: 50 },
    ])
  })
  it('無資料回空結構', async () => {
    expect((await get('/stocks/7202/metrics')).body).toEqual({ quarters: [], payouts: [] })
  })
})

describe('股利與填息', () => {
  it('依年度、期別由新到舊；計算填息與填息天數；未填息顯示距離', async () => {
    expect((await get('/stocks/7201/dividends')).body).toEqual([
      { year: '115', period: 'Q2', cash: 3, stock: 0.5, exDate: '2026-09-20', refPrice: 120, filled: false, fillDays: null, gapPct: -4.17 },
      { year: '115', period: 'Q1', cash: 2.5, stock: 0, exDate: '2026-07-10', refPrice: 100, filled: true, fillDays: 3, gapPct: null },
      { year: '114', period: '全年', cash: 4, stock: 0, exDate: '2025-08-01', refPrice: null, filled: null, fillDays: null, gapPct: null },
    ])
  })
  it('無資料回空陣列；查無股票 404', async () => {
    expect((await get('/stocks/7202/dividends')).body).toEqual([])
    expect((await get('/stocks/0000/dividends')).status).toBe(404)
  })
})

describe('估值', () => {
  it('取最新一筆 PE/PB/殖利率，附近四季 EPS 與本益比歷史', async () => {
    expect((await get('/stocks/7201/valuation')).body).toEqual({
      date: '2026-09-22',
      pe: 16,
      pb: 2.2,
      dividendYield: 3.1,
      ttmEps: 12,
      history: [
        { date: '2026-09-21', pe: 15.5 },
        { date: '2026-09-22', pe: 16 },
      ],
    })
  })
  it('PE、殖利率缺值時以收盤價、近四季 EPS、最近有配息年度回推', async () => {
    expect((await get('/stocks/7203/valuation')).body).toMatchObject({ pe: 15, pb: 1.1, dividendYield: 5, ttmEps: 6 })
  })
  it('無資料時各欄為 null', async () => {
    expect((await get('/stocks/7202/valuation')).body).toEqual({
      date: null, pe: null, pb: null, dividendYield: null, ttmEps: null, history: [],
    })
  })
})

describe('資料邊界', () => {
  beforeAll(async () => {
    const a = t.admin
    await a`
      INSERT INTO stocks.stocks (id, name, market, sector, is_active) VALUES
        ('7204', '月配', 'TWSE', NULL, TRUE), ('7205', '缺季', 'TWSE', NULL, TRUE), ('7206', '季配', 'TPEX', NULL, TRUE)`
    // 7204：年度與期別為文字欄位，需依數值與除息日排序
    await a`
      INSERT INTO stocks.dividends (stock_id, dividend_year, period, cash_dividend, ex_dividend_date) VALUES
        ('7204', '99', '全年', 1, '2010-08-01'),
        ('7204', '115', '1', 0.1, '2026-01-20'),
        ('7204', '115', '2', 0.1, '2026-02-20'),
        ('7204', '115', '12', 0.1, '2026-12-20')`
    // 7205：缺 2025Q3
    for (const [y, q, net, eps] of [[2025, 1, 100, 1], [2025, 2, 100, 1], [2025, 4, 150, 1], [2026, 1, 100, 1]] as const) {
      await a`
        INSERT INTO stocks.financial_statements (stock_id, year, quarter, revenue, net_income, eps)
        VALUES ('7205', ${y}, ${q}, 1000, ${net}, ${eps})`
    }
    await a`
      INSERT INTO stocks.balance_sheets (stock_id, year, quarter, total_assets, total_equity)
      VALUES ('7205', 2025, 2, 2000, 1000), ('7205', 2025, 4, 6000, 3000)`
    // 7206：季配息，近 12 個月（以最新收盤日回推）配 4 次
    await a`INSERT INTO stocks.valuations (date, stock_id, pe, pb, dividend_yield) VALUES ('2026-09-22', '7206', NULL, NULL, NULL)`
    await a`
      INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value)
      VALUES ('2026-09-22', '7206', 50, 50, 50, 50, 1, 1)`
    await a`
      INSERT INTO stocks.dividends (stock_id, dividend_year, period, cash_dividend, ex_dividend_date) VALUES
        ('7206', '114', 'Q2', 0.5, '2025-07-15'),
        ('7206', '114', 'Q3', 0.5, '2025-10-15'),
        ('7206', '115', 'Q1', 0.5, '2026-01-15'),
        ('7206', '115', 'Q2', 0.5, '2026-04-15'),
        ('7206', '115', 'Q3', 0.5, '2026-07-15')`
  })

  it('股利依年度數值、除息日由新到舊（不是字串排序）', async () => {
    const { body } = await get<{ year: string; period: string }[]>('/stocks/7204/dividends')
    expect(body.map((d) => `${d.year}/${d.period}`)).toEqual(['115/12', '115/2', '115/1', '99/全年'])
  })

  it('近四季不連續時不計算 TTM EPS', async () => {
    expect((await get<{ ttmEps: number | null }>('/stocks/7205/valuation')).body.ttmEps).toBeNull()
  })

  it('ROE 期初期末平均用真正的前一季；前一季缺資料就只用當季', async () => {
    const { body } = await get<{ quarters: { period: string; roe: number | null }[] }>('/stocks/7205/metrics')
    // 2025Q4：前一季 Q3 無資料 → 只用 Q4 權益 3000：150×4÷3000 = 20%
    expect(body.quarters.find((q) => q.period === '2025Q4')!.roe).toBe(20)
  })

  it('殖利率回推用近 12 個月（依除息日）的現金股利，季配息不會被低估', async () => {
    // 2025-10-15 起 4 次 × 0.5 = 2.0；2.0 ÷ 50 = 4%
    expect((await get<{ dividendYield: number | null }>('/stocks/7206/valuation')).body.dividendYield).toBe(4)
  })
})

describe('ETF 成分股', () => {
  it('非 ETF 回 isEtf=false', async () => {
    expect((await get('/stocks/7201/etf-holdings')).body).toEqual({ isEtf: false, holdings: [] })
  })
  it('依權重排序，產業比重去除「類指數」並合併查無產業為「其他」', async () => {
    expect((await get('/stocks/0099/etf-holdings')).body).toEqual({
      isEtf: true,
      updatedDate: '2026-09-20',
      info: [{ label: '規模', value: '100億' }],
      industries: [
        { sector: '金融', weight: 50 },
        { sector: '半導體', weight: 30 },
        { sector: '其他', weight: 20 },
      ],
      holdings: [
        { stockId: '7203', stockName: '估值回推', weight: 50, shares: 2000 },
        { stockId: '7201', stockName: '基本面甲', weight: 30, shares: 1000 },
        { stockId: '9999', stockName: '不在清單', weight: 20, shares: null },
      ],
    })
  })
  it('ETF 尚無成分股資料時回空清單；查無股票 404', async () => {
    expect((await get('/stocks/0098/etf-holdings')).body).toEqual({
      isEtf: true, updatedDate: null, info: [], industries: [], holdings: [],
    })
    expect((await get('/stocks/0000/etf-holdings')).status).toBe(404)
  })
})
