import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { notifications, signalDigests, watchlistGroups } from '../../db/schema/members.js'
import { signalLabel } from '../../lib/signals.js'
import type { Triggered } from './alerts.repository.js'

export const MAX_DIGESTS_PER_USER = 20
/** 單則通知最多列出的股票數（Telegram 單則上限 4096 字） */
const MAX_STOCKS_IN_BODY = 30

type Row = typeof signalDigests.$inferSelect

export function createSignalDigestsRepository(db: Db) {
  const toItem = (r: Row, groupName: string | null) => ({
    id: r.id,
    groupId: r.groupId,
    groupName,
    signals: r.signals,
    isActive: r.isActive,
    lastNotifiedDate: r.lastNotifiedDate,
    createdAt: r.createdAt.toISOString(),
  })
  const withGroup = () =>
    db.select({ d: signalDigests, groupName: watchlistGroups.name }).from(signalDigests)
      .leftJoin(watchlistGroups, eq(watchlistGroups.id, signalDigests.groupId))
  const mine = (userId: string, id: string) => and(eq(signalDigests.id, id), eq(signalDigests.userId, userId))

  return {
    async list(userId: string) {
      const rows = await withGroup().where(eq(signalDigests.userId, userId)).orderBy(desc(signalDigests.createdAt))
      return rows.map((r) => toItem(r.d, r.groupName))
    },

    /** 分組不是自己的回 'no_group'；超過上限回 'limit' */
    async create(userId: string, input: { groupId: string | null; signals: string[] }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`signal-digests:${userId}`}))`)
        let groupName: string | null = null
        if (input.groupId) {
          const [g] = await tx.select({ name: watchlistGroups.name }).from(watchlistGroups)
            .where(and(eq(watchlistGroups.id, input.groupId), eq(watchlistGroups.userId, userId)))
          if (!g) return 'no_group' as const
          groupName = g.name
        }
        const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(signalDigests).where(eq(signalDigests.userId, userId))
        if ((cnt?.n ?? 0) >= MAX_DIGESTS_PER_USER) return 'limit' as const
        const [r] = await tx.insert(signalDigests).values({ userId, ...input }).returning()
        return toItem(r!, groupName)
      })
    },

    async setActive(userId: string, id: string, isActive: boolean) {
      const [r] = await db.update(signalDigests).set({ isActive }).where(mine(userId, id)).returning({ id: signalDigests.id })
      if (!r) return null
      const [row] = await withGroup().where(eq(signalDigests.id, r.id))
      return row ? toItem(row.d, row.groupName) : null
    },

    async remove(userId: string, id: string) {
      const rows = await db.delete(signalDigests).where(mine(userId, id)).returning({ id: signalDigests.id })
      return rows.length > 0
    },

    /**
     * 以最新訊號日彙整：每個啟用中的訂閱，找出範圍內（自選股全部或該分組）出現指定訊號的股票，
     * 合成一則通知。先以 UPDATE ... WHERE last_notified_date < d 搶下訂閱，保證同日只發一次。
     */
    async evaluate(): Promise<Triggered[]> {
      const [latest] = await db.execute<{ d: string | null }>(sql`SELECT MAX(date)::text AS d FROM stocks.technical_signals`)
      const d = latest?.d
      if (!d) return []
      return db.transaction(async (tx) => {
        const hits = await tx.execute<{ id: string; user_id: string; group_name: string | null; stock_id: string; name: string; signal: string }>(sql`
          SELECT dg.id, dg.user_id, g.name AS group_name, ts.stock_id, s.name, ts.signal
          FROM members.signal_digests dg
          LEFT JOIN members.watchlist_groups g ON g.id = dg.group_id
          JOIN members.watchlists w ON w.user_id = dg.user_id AND (dg.group_id IS NULL OR w.group_id = dg.group_id)
          JOIN stocks.technical_signals ts ON ts.date = ${d} AND ts.stock_id = w.stock_id AND ts.signal = ANY(dg.signals)
          JOIN stocks.stocks s ON s.id = ts.stock_id
          WHERE dg.is_active AND (dg.last_notified_date IS NULL OR dg.last_notified_date < ${d})
          ORDER BY dg.id, ts.stock_id, ts.signal`)
        if (!hits.length) return []
        const ids = [...new Set(hits.map((h) => h.id))]
        const claimed = new Set((await tx.update(signalDigests).set({ lastNotifiedDate: d })
          .where(and(inArray(signalDigests.id, ids), sql`(${signalDigests.lastNotifiedDate} IS NULL OR ${signalDigests.lastNotifiedDate} < ${d})`))
          .returning({ id: signalDigests.id })).map((r) => r.id))

        const values = ids.filter((id) => claimed.has(id)).map((id) => {
          const rows = hits.filter((h) => h.id === id)
          const byStock = new Map<string, string[]>()
          for (const h of rows) {
            const key = `${h.stock_id} ${h.name}`
            byStock.set(key, [...(byStock.get(key) ?? []), signalLabel(h.signal)])
          }
          const lines = [...byStock].map(([stock, labels]) => `${stock}：${labels.join('、')}`)
          const shown = lines.slice(0, MAX_STOCKS_IN_BODY)
          const more = lines.length - shown.length
          return {
            userId: rows[0]!.user_id,
            title: `${rows[0]!.group_name ?? '自選股'} 今日訊號（${byStock.size} 檔）`,
            body: `${d} 盤後訊號\n${shown.join('\n')}${more > 0 ? `\n…另有 ${more} 檔` : ''}`,
          }
        })
        if (!values.length) return []
        const rows = await tx.insert(notifications).values(values).returning({ id: notifications.id })
        return rows.map((r, i) => ({ userId: values[i]!.userId, notificationId: r.id, title: values[i]!.title, body: values[i]!.body }))
      })
    },
  }
}
