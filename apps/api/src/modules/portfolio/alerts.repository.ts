import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { alertRules, notifications } from '../../db/schema/members.js'
import { stocks } from '../../db/schema/stocks.js'

export type AlertType = 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_above'
export const MAX_RULES_PER_USER = 100

/** 評估後觸發的提醒（Telegram 等通道用） */
export type Triggered = { userId: string; notificationId: string; title: string; body: string }

const fmt = (v: number) => Number(v.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 })

function describe(type: AlertType, threshold: number): string {
  switch (type) {
    case 'price_above': return `股價高於 ${fmt(threshold)}`
    case 'price_below': return `股價低於 ${fmt(threshold)}`
    case 'change_above': return `漲幅達 ${fmt(threshold)}%`
    case 'change_below': return `跌幅達 ${fmt(threshold)}%`
    case 'volume_above': return `成交量達 ${fmt(threshold)} 張`
  }
}

export function createAlertsRepository(db: Db) {
  const toItem = (r: typeof alertRules.$inferSelect & { stockName: string }) => ({
    id: r.id,
    stockId: r.stockId,
    stockName: r.stockName,
    alertType: r.alertType as AlertType,
    threshold: Number(r.threshold),
    isActive: r.isActive,
    isTriggered: r.triggeredAt != null,
    triggeredAt: r.triggeredAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  })
  const withName = () =>
    db.select({ rule: alertRules, stockName: stocks.name }).from(alertRules).innerJoin(stocks, eq(stocks.id, alertRules.stockId))

  return {
    async list(userId: string) {
      const rows = await withName().where(eq(alertRules.userId, userId)).orderBy(desc(alertRules.createdAt))
      return rows.map((r) => toItem({ ...r.rule, stockName: r.stockName }))
    },

    async stockName(stockId: string) {
      const [s] = await db.select({ name: stocks.name }).from(stocks).where(and(eq(stocks.id, stockId), eq(stocks.isActive, true)))
      return s?.name ?? null
    },

    /** 在上限內才新增；以使用者為單位的 advisory lock 讓併發新增也不會超過上限。超過回 null */
    async create(userId: string, input: { stockId: string; alertType: AlertType; threshold: number }, stockName: string) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`alerts:${userId}`}))`)
        const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(alertRules).where(eq(alertRules.userId, userId))
        if ((cnt?.n ?? 0) >= MAX_RULES_PER_USER) return null
        const [r] = await tx.insert(alertRules).values({ userId, ...input, threshold: String(input.threshold) }).returning()
        return toItem({ ...r!, stockName })
      })
    },

    async remove(userId: string, id: string) {
      const rows = await db.delete(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.userId, userId))).returning({ id: alertRules.id })
      return rows.length > 0
    },

    async reset(userId: string, id: string) {
      const [r] = await db.update(alertRules).set({ triggeredAt: null })
        .where(and(eq(alertRules.id, id), eq(alertRules.userId, userId))).returning()
      if (!r) return null
      return toItem({ ...r, stockName: (await this.stockName(r.stockId)) ?? '' })
    },

    async notifications(userId: string) {
      const [items, [unread]] = await Promise.all([
        db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50),
        db.select({ n: sql<number>`count(*)::int` }).from(notifications)
          .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
      ])
      return {
        unreadCount: unread?.n ?? 0,
        items: items.map((n) => ({
          id: n.id, title: n.title, body: n.body, stockId: n.stockId,
          readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString(),
        })),
      }
    },

    async markRead(userId: string, ids?: string[]) {
      await db.update(notifications).set({ readAt: new Date() }).where(and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ids?.length ? inArray(notifications.id, ids) : undefined,
      ))
    },

    /**
     * 盤後評估：以最新交易日行情比對所有啟用且未觸發的規則。成立者在同一 transaction 內
     * 標記 triggered_at 並寫入通知（UPDATE ... WHERE triggered_at IS NULL 保證不重複）。
     */
    async evaluate(): Promise<Triggered[]> {
      // 先查出日期再以常數帶入，避免 hypertable 查詢鎖住所有 chunk
      const [latest] = await db.execute<{ d: string | null }>(sql`SELECT MAX(date)::text AS d FROM stocks.daily_quotes`)
      const d = latest?.d
      if (!d) return []
      return db.transaction(async (tx) => {
        const hits = await tx.execute<{
          id: string; user_id: string; stock_id: string; alert_type: AlertType; threshold: string
          close: string; change_pct: string | null; volume: string; name: string
        }>(sql`
          UPDATE members.alert_rules r SET triggered_at = NOW()
          FROM stocks.daily_quotes q JOIN stocks.stocks s ON s.id = q.stock_id
          WHERE r.is_active AND r.triggered_at IS NULL AND q.stock_id = r.stock_id AND q.date = ${d}
            AND CASE r.alert_type
              WHEN 'price_above' THEN q.close >= r.threshold
              WHEN 'price_below' THEN q.close <= r.threshold
              WHEN 'change_above' THEN q.change_pct >= r.threshold
              WHEN 'change_below' THEN q.change_pct <= -r.threshold
              WHEN 'volume_above' THEN q.volume / 1000.0 >= r.threshold
              ELSE FALSE END
          RETURNING r.id, r.user_id, r.stock_id, r.alert_type, r.threshold, q.close, q.change_pct, q.volume, s.name`)
        if (!hits.length) return []
        const values = hits.map((h) => {
          const chg = h.change_pct == null ? null : Number(h.change_pct)
          return {
            userId: h.user_id,
            alertRuleId: h.id,
            stockId: h.stock_id,
            title: `${h.name} ${h.stock_id} ${describe(h.alert_type, Number(h.threshold))}`,
            body: `${d} 收盤 ${Number(h.close)}`
              + (chg == null ? '' : `（${chg > 0 ? '+' : ''}${chg}%）`)
              + `，成交 ${Math.round(Number(h.volume) / 1000).toLocaleString('en-US')} 張`,
          }
        })
        const rows = await tx.insert(notifications).values(values).returning({ id: notifications.id })
        return rows.map((r, i) => ({ userId: values[i]!.userId, notificationId: r.id, title: values[i]!.title, body: values[i]!.body }))
      })
    },
  }
}
