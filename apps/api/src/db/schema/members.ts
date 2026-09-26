// members schema：由 api 擁有，改動後跑 `pnpm db:generate` 產生 migration
import {
  boolean,
  check,
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
import { sql } from 'drizzle-orm'

export const members = pgSchema('members')

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const users = members.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  googleId: varchar('google_id', { length: 100 }).notNull().unique(),
  nickname: varchar('nickname', { length: 50 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
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
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).notNull(),
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
    /** 持有部位總成本（含手續費）；另存以免 avg_cost 四捨五入累積誤差 */
    costBasis: numeric('cost_basis', { precision: 16, scale: 2 }).notNull().default('0'),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
    /** 依除息日持有股數計算的累計現金股利 */
    earnedDividend: numeric('earned_dividend', { precision: 18, scale: 2 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.stockId] })],
)

/**
 * 股利權利明細：依除息日當天持有股數（除息日前買入 − 除息日前賣出）計算，
 * 由重播產生、可隨時重算；holdings.earned_dividend 為其加總。
 */
export const dividendEntitlements = members.table(
  'dividend_entitlements',
  {
    userId: userId(),
    stockId: varchar('stock_id', { length: 10 }).notNull(),
    exDate: date('ex_date').notNull(),
    cashPerShare: numeric('cash_per_share', { precision: 10, scale: 4 }).notNull(),
    shares: integer('shares').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.stockId, t.exDate] })],
)

/** 盤後提醒規則（#26）：行情任務完成後評估；成立後標記 triggered_at，需手動重設才會再提醒。 */
export const ALERT_TYPES = ['price_above', 'price_below', 'change_above', 'change_below', 'volume_above'] as const
export const alertRules = members.table(
  'alert_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userId(),
    stockId: varchar('stock_id', { length: 10 }).notNull(),
    alertType: varchar('alert_type', { length: 20 }).notNull(),
    threshold: numeric('threshold', { precision: 16, scale: 4 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_alert_rules_stock').on(t.stockId),
    index('idx_alert_rules_user').on(t.userId),
    check('alert_type_valid', sql`${t.alertType} IN ('price_above', 'price_below', 'change_above', 'change_below', 'volume_above')`),
  ],
)

/** 站內通知（#26）；Telegram 等通道的送出狀態另記 */
export const notifications = members.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userId(),
    alertRuleId: uuid('alert_rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
    stockId: varchar('stock_id', { length: 10 }),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_notifications_user_created').on(t.userId, t.createdAt)],
)
