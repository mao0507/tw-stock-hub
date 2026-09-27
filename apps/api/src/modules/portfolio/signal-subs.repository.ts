import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { notifications, signalSubscriptions } from '../../db/schema/members.js'
import { stocks } from '../../db/schema/stocks.js'
import { signalLabel } from '../../lib/signals.js'
import type { Triggered } from './alerts.repository.js'

export const MAX_SIGNAL_SUBS_PER_USER = 200

type Row = typeof signalSubscriptions.$inferSelect

export function createSignalSubsRepository(db: Db) {
  const toItem = (r: Row, stockName: string) => ({
    id: r.id,
    stockId: r.stockId,
    stockName,
    signal: r.signal,
    isActive: r.isActive,
    lastNotifiedDate: r.lastNotifiedDate,
    createdAt: r.createdAt.toISOString(),
  })
  const mine = (userId: string, id: string) => and(eq(signalSubscriptions.id, id), eq(signalSubscriptions.userId, userId))

  return {
    async list(userId: string) {
      const rows = await db.select({ s: signalSubscriptions, name: stocks.name }).from(signalSubscriptions)
        .innerJoin(stocks, eq(stocks.id, signalSubscriptions.stockId))
        .where(eq(signalSubscriptions.userId, userId)).orderBy(desc(signalSubscriptions.createdAt))
      return rows.map((r) => toItem(r.s, r.name))
    },

    /** 上限內才新增（advisory lock 防併發超量）；超過上限回 'limit'、重複訂閱回 'duplicate' */
    async create(userId: string, input: { stockId: string; signal: string }, stockName: string) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`signal-subs:${userId}`}))`)
        const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(signalSubscriptions)
          .where(eq(signalSubscriptions.userId, userId))
        if ((cnt?.n ?? 0) >= MAX_SIGNAL_SUBS_PER_USER) return 'limit' as const
        const [r] = await tx.insert(signalSubscriptions).values({ userId, ...input }).onConflictDoNothing().returning()
        return r ? toItem(r, stockName) : ('duplicate' as const)
      })
    },

    async setActive(userId: string, id: string, isActive: boolean) {
      const [r] = await db.update(signalSubscriptions).set({ isActive }).where(mine(userId, id)).returning()
      if (!r) return null
      const [s] = await db.select({ name: stocks.name }).from(stocks).where(eq(stocks.id, r.stockId))
      return toItem(r, s?.name ?? '')
    },

    async remove(userId: string, id: string) {
      const rows = await db.delete(signalSubscriptions).where(mine(userId, id)).returning({ id: signalSubscriptions.id })
      return rows.length > 0
    },

    /**
     * 訊號任務完成後：以最新訊號日比對啟用中的訂閱。成立者在同一 transaction 內
     * 更新 last_notified_date 並寫入通知（WHERE last_notified_date < d 保證同日只通知一次）。
     */
    async evaluate(): Promise<Triggered[]> {
      // 先查出日期再以常數帶入，避免 hypertable 查詢鎖住所有 chunk
      const [latest] = await db.execute<{ d: string | null }>(sql`SELECT MAX(date)::text AS d FROM stocks.technical_signals`)
      const d = latest?.d
      if (!d) return []
      return db.transaction(async (tx) => {
        const hits = await tx.execute<{ user_id: string; stock_id: string; signal: string; side: string; name: string }>(sql`
          UPDATE members.signal_subscriptions sub SET last_notified_date = ${d}
          FROM stocks.technical_signals ts JOIN stocks.stocks s ON s.id = ts.stock_id
          WHERE sub.is_active AND ts.date = ${d} AND ts.stock_id = sub.stock_id AND ts.signal = sub.signal
            AND (sub.last_notified_date IS NULL OR sub.last_notified_date < ${d})
          RETURNING sub.user_id, sub.stock_id, sub.signal, ts.side, s.name`)
        if (!hits.length) return []
        const values = hits.map((h) => ({
          userId: h.user_id,
          stockId: h.stock_id,
          title: `${h.name} ${h.stock_id} ${signalLabel(h.signal)}`,
          body: `${d} 盤後偵測到${h.side === 'bull' ? '多方' : '空方'}訊號（僅供參考，非買賣建議）`,
        }))
        const rows = await tx.insert(notifications).values(values).returning({ id: notifications.id })
        return rows.map((r, i) => ({ userId: values[i]!.userId, notificationId: r.id, title: values[i]!.title, body: values[i]!.body }))
      })
    },
  }
}
