// stocks schema：由 db/init/01-stocks.sql 建立、crawler 寫入。
// 這裡只宣告 api 會查的表（唯讀映射），不參與 drizzle-kit migration。
import { bigint, boolean, date, integer, jsonb, numeric, pgSchema, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const stocksSchema = pgSchema('stocks')

export const stocks = stocksSchema.table('stocks', {
  id: varchar('id', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  market: varchar('market', { length: 10 }).notNull(),
  sector: varchar('sector', { length: 50 }),
  isActive: boolean('is_active').notNull(),
})

export const dailyQuotes = stocksSchema.table('daily_quotes', {
  date: date('date').notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  open: numeric('open', { precision: 12, scale: 2 }).notNull(),
  high: numeric('high', { precision: 12, scale: 2 }).notNull(),
  low: numeric('low', { precision: 12, scale: 2 }).notNull(),
  close: numeric('close', { precision: 12, scale: 2 }).notNull(),
  volume: bigint('volume', { mode: 'number' }).notNull(),
  value: bigint('value', { mode: 'number' }).notNull(),
  change: numeric('change', { precision: 8, scale: 2 }),
  changePct: numeric('change_pct', { precision: 8, scale: 2 }),
  transactionCount: integer('transaction_count'),
})

export const pendingJobs = stocksSchema.table('pending_jobs', {
  id: serial('id').primaryKey(),
  jobName: varchar('job_name', { length: 50 }).notNull(),
  status: varchar('status', { length: 10 }).notNull(),
  result: text('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export const exDividendCalendar = stocksSchema.table('ex_dividend_calendar', {
  exDate: date('ex_date').notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  cashDividend: numeric('cash_dividend', { precision: 10, scale: 4 }),
})

export const institutionalTrading = stocksSchema.table('institutional_trading', {
  date: date('date').notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  foreignNet: bigint('foreign_net', { mode: 'number' }).notNull(),
  trustNet: bigint('trust_net', { mode: 'number' }).notNull(),
  dealerNet: bigint('dealer_net', { mode: 'number' }).notNull(),
  totalNet: bigint('total_net', { mode: 'number' }).notNull(),
})

export const marginTrading = stocksSchema.table('margin_trading', {
  date: date('date').notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  marginBalance: bigint('margin_balance', { mode: 'number' }).notNull(),
  marginChange: bigint('margin_change', { mode: 'number' }).notNull(),
  shortBalance: bigint('short_balance', { mode: 'number' }).notNull(),
  shortChange: bigint('short_change', { mode: 'number' }).notNull(),
})

export const shareholderDispersion = stocksSchema.table('shareholder_dispersion', {
  date: date('date').notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  bigHolderPct: numeric('big_holder_pct', { precision: 8, scale: 2 }),
  bigHolderCount: integer('big_holder_count'),
  totalHolders: integer('total_holders'),
})

export const monthlyRevenue = stocksSchema.table('monthly_revenue', {
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  yearMonth: varchar('year_month', { length: 6 }).notNull(),
  revenue: bigint('revenue', { mode: 'number' }),
  momPct: numeric('mom_pct', { precision: 10, scale: 2 }),
  yoyPct: numeric('yoy_pct', { precision: 10, scale: 2 }),
  cumYoyPct: numeric('cum_yoy_pct', { precision: 10, scale: 2 }),
})

export const financialStatements = stocksSchema.table('financial_statements', {
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  year: integer('year').notNull(),
  quarter: integer('quarter').notNull(),
  revenue: bigint('revenue', { mode: 'number' }),
  grossProfit: bigint('gross_profit', { mode: 'number' }),
  opIncome: bigint('op_income', { mode: 'number' }),
  pretaxIncome: bigint('pretax_income', { mode: 'number' }),
  netIncome: bigint('net_income', { mode: 'number' }),
  eps: numeric('eps', { precision: 8, scale: 2 }),
  costOfGoodsSold: bigint('cost_of_goods_sold', { mode: 'number' }),
  opExpenses: bigint('op_expenses', { mode: 'number' }),
  nonOpIncome: bigint('non_op_income', { mode: 'number' }),
})

export const balanceSheets = stocksSchema.table('balance_sheets', {
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  year: integer('year').notNull(),
  quarter: integer('quarter').notNull(),
  totalAssets: bigint('total_assets', { mode: 'number' }),
  totalEquity: bigint('total_equity', { mode: 'number' }),
  accountsReceivable: bigint('accounts_receivable', { mode: 'number' }),
  inventories: bigint('inventories', { mode: 'number' }),
  contractLiabilities: bigint('contract_liabilities', { mode: 'number' }),
})

export const dividends = stocksSchema.table('dividends', {
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  dividendYear: varchar('dividend_year', { length: 10 }).notNull(),
  period: varchar('period', { length: 10 }).notNull(),
  cashDividend: numeric('cash_dividend', { precision: 10, scale: 4 }),
  stockDividend: numeric('stock_dividend', { precision: 10, scale: 4 }),
  exDividendDate: date('ex_dividend_date'),
})

export const valuations = stocksSchema.table('valuations', {
  date: date('date').notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  pe: numeric('pe', { precision: 10, scale: 2 }),
  pb: numeric('pb', { precision: 10, scale: 2 }),
  dividendYield: numeric('dividend_yield', { precision: 8, scale: 2 }),
})

export const etfHoldings = stocksSchema.table('etf_holdings', {
  etfId: varchar('etf_id', { length: 10 }).notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  stockName: varchar('stock_name', { length: 50 }),
  weight: numeric('weight', { precision: 6, scale: 2 }),
  shares: bigint('shares', { mode: 'number' }),
  updatedDate: date('updated_date'),
})

export const etfInfo = stocksSchema.table('etf_info', {
  etfId: varchar('etf_id', { length: 10 }).notNull(),
  items: jsonb('items'),
  updatedDate: date('updated_date'),
})

export const marketIndex = stocksSchema.table('market_index', {
  date: date('date').notNull(),
  taiexClose: numeric('taiex_close', { precision: 12, scale: 2 }).notNull(),
  taiexChange: numeric('taiex_change', { precision: 10, scale: 2 }).notNull(),
  taiexChangePct: numeric('taiex_change_pct', { precision: 8, scale: 2 }).notNull(),
  totalVolume: bigint('total_volume', { mode: 'number' }).notNull(),
  totalValue: bigint('total_value', { mode: 'number' }).notNull(),
  upCount: integer('up_count').notNull(),
  downCount: integer('down_count').notNull(),
  flatCount: integer('flat_count').notNull(),
  limitUpCount: integer('limit_up_count').notNull(),
  limitDownCount: integer('limit_down_count').notNull(),
  taiexOpen: numeric('taiex_open', { precision: 12, scale: 2 }),
  taiexHigh: numeric('taiex_high', { precision: 12, scale: 2 }),
  taiexLow: numeric('taiex_low', { precision: 12, scale: 2 }),
  taiexPrevClose: numeric('taiex_prev_close', { precision: 12, scale: 2 }),
})

export const sectorPerformance = stocksSchema.table('sector_performance', {
  date: date('date').notNull(),
  sectorName: varchar('sector_name', { length: 50 }).notNull(),
  changePct: numeric('change_pct', { precision: 8, scale: 2 }).notNull(),
  volume: bigint('volume', { mode: 'number' }),
  value: bigint('value', { mode: 'number' }),
})
