// stocks schema：由 db/init/01-stocks.sql 建立、crawler 寫入。
// 這裡只宣告 api 會查的表（唯讀映射），不參與 drizzle-kit migration。
import { bigint, boolean, date, integer, numeric, pgSchema, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

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
