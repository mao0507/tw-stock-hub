// members schema：由 api 擁有，改動後跑 `pnpm db:generate` 產生 migration
import {
  date,
  index,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const members = pgSchema('members')

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const users = members.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  googleId: varchar('google_id', { length: 100 }).notNull().unique(),
  nickname: varchar('nickname', { length: 50 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

export const watchlistGroups = members.table(
  'watchlist_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userId(),
    name: varchar('name', { length: 50 }).notNull(),
    color: varchar('color', { length: 20 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('idx_watchlist_groups_user').on(t.userId)],
)

export const watchlists = members.table(
  'watchlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userId(),
    groupId: uuid('group_id').references(() => watchlistGroups.id, { onDelete: 'set null' }),
    stockId: varchar('stock_id', { length: 10 }).notNull(),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_watchlist_user_stock').on(t.userId, t.stockId)],
)

/** 買入批次。持有股數與股利一律由 lots + sells 推導，不直接改 holdings。 */
export const holdingLots = members.table(
  'holding_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userId(),
    stockId: varchar('stock_id', { length: 10 }).notNull(),
    boughtAt: date('bought_at').notNull(),
    price: numeric('price', { precision: 12, scale: 4 }).notNull(),
    shares: integer('shares').notNull(),
    fee: numeric('fee', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: createdAt(),
  },
  (t) => [index('idx_holding_lots_user_stock').on(t.userId, t.stockId, t.boughtAt)],
)

/** 賣出紀錄：以賣出當下的加權平均成本計算已實現損益。 */
export const sellTransactions = members.table(
  'sell_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userId(),
    stockId: varchar('stock_id', { length: 10 }).notNull(),
    soldAt: date('sold_at').notNull(),
    price: numeric('price', { precision: 12, scale: 4 }).notNull(),
    shares: integer('shares').notNull(),
    fee: numeric('fee', { precision: 12, scale: 2 }).notNull().default('0'),
    tax: numeric('tax', { precision: 12, scale: 2 }).notNull().default('0'),
    avgCostAtSale: numeric('avg_cost_at_sale', { precision: 12, scale: 4 }).notNull(),
    realizedPnl: numeric('realized_pnl', { precision: 14, scale: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('idx_sell_tx_user_stock').on(t.userId, t.stockId, t.soldAt)],
)

/** 彙總表：由 holding_lots + sell_transactions 在同一 transaction 內重算，不是資料源。 */
export const holdings = members.table(
  'holdings',
  {
    userId: userId(),
    stockId: varchar('stock_id', { length: 10 }).notNull(),
    shares: integer('shares').notNull(),
    avgCost: numeric('avg_cost', { precision: 12, scale: 4 }).notNull(),
    realizedPnl: numeric('realized_pnl', { precision: 14, scale: 2 }).notNull().default('0'),
    /** 依除息日持有股數計算的累計現金股利 */
    earnedDividend: numeric('earned_dividend', { precision: 14, scale: 2 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.stockId] })],
)
