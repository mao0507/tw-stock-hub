// stocks schema：由 db/init/01-stocks.sql 建立、crawler 寫入。
// 這裡只宣告 api 會查的表（唯讀映射），不參與 drizzle-kit migration。
import { bigint, date, numeric, pgSchema, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const stocksSchema = pgSchema('stocks')

export const stocks = stocksSchema.table('stocks', {
  id: varchar('id', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  market: varchar('market', { length: 10 }).notNull(),
  sector: varchar('sector', { length: 50 }),
})

export const dailyQuotes = stocksSchema.table('daily_quotes', {
  date: date('date').notNull(),
  stockId: varchar('stock_id', { length: 10 }).notNull(),
  open: numeric('open', { precision: 12, scale: 2 }).notNull(),
  high: numeric('high', { precision: 12, scale: 2 }).notNull(),
  low: numeric('low', { precision: 12, scale: 2 }).notNull(),
  close: numeric('close', { precision: 12, scale: 2 }).notNull(),
  volume: bigint('volume', { mode: 'number' }).notNull(),
  change: numeric('change', { precision: 8, scale: 2 }),
  changePct: numeric('change_pct', { precision: 8, scale: 2 }),
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
