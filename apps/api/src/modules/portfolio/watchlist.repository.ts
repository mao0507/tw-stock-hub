import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { Db } from '../../db/client.js'
import { watchlistGroups, watchlists } from '../../db/schema/members.js'
import { stocks } from '../../db/schema/stocks.js'

export type GroupDto = { id: string; name: string; color: string | null; sortOrder: number }
export type GroupInput = { name: string; color?: string | null; sortOrder?: number }
export type ItemPatch = { note?: string | null; groupId?: string | null; sortOrder?: number }

const fail = (status: 400 | 404 | 409, error: string) =>
  new HTTPException(status, { res: Response.json({ error }, { status }) })

const groupColumns = {
  id: watchlistGroups.id,
  name: watchlistGroups.name,
  color: watchlistGroups.color,
  sortOrder: watchlistGroups.sortOrder,
}

/** Postgres unique_violation（drizzle 可能把原始錯誤包在 cause 裡） */
const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** 某分組（null = 未分組）下一個排序值：排在最後 */
async function nextItemOrder(q: Db | Tx, userId: string, groupId: string | null): Promise<number> {
  const [row] = await q
    .select({ next: sql<number>`COALESCE(MAX(${watchlists.sortOrder}), -1) + 1` })
    .from(watchlists)
    .where(and(eq(watchlists.userId, userId), groupId ? eq(watchlists.groupId, groupId) : isNull(watchlists.groupId)))
  return Number(row!.next)
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x))

export function createWatchlistRepository(db: Db) {
  async function assertOwnGroup(userId: string, groupId: string | null | undefined) {
    if (!groupId) return
    const [g] = await db
      .select({ id: watchlistGroups.id })
      .from(watchlistGroups)
      .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, userId)))
    if (!g) throw fail(400, '分組不存在')
  }

  return {
    /** 分組 + 自選股（附名稱與最新收盤價、漲跌） */
    async list(userId: string) {
      const groups = await db
        .select(groupColumns)
        .from(watchlistGroups)
        .where(eq(watchlistGroups.userId, userId))
        .orderBy(asc(watchlistGroups.sortOrder), asc(watchlistGroups.createdAt))

      const rows = await db.execute<{
        id: string
        stock_id: string
        name: string | null
        group_id: string | null
        note: string | null
        sort_order: number
        added_at: string
        close: string | null
        change: string | null
        change_pct: string | null
        price_date: string | null
      }>(sql`
        SELECT w.id, w.stock_id, s.name, w.group_id, w.note, w.sort_order, w.added_at,
               q.close, q.change, q.change_pct, q.date::text AS price_date
        FROM members.watchlists w
        LEFT JOIN stocks.stocks s ON s.id = w.stock_id
        LEFT JOIN LATERAL (
          SELECT close, change, change_pct, date FROM stocks.daily_quotes
          WHERE stock_id = w.stock_id ORDER BY date DESC LIMIT 1
        ) q ON TRUE
        WHERE w.user_id = ${userId}
        ORDER BY w.sort_order, w.added_at`)

      const num = (v: string | null) => (v === null ? null : Number(v))
      return {
        groups,
        items: rows.map((r) => ({
          id: r.id,
          stockId: r.stock_id,
          name: r.name ?? r.stock_id,
          groupId: r.group_id,
          note: r.note,
          sortOrder: r.sort_order,
          addedAt: new Date(r.added_at).toISOString(),
          close: num(r.close),
          change: num(r.change),
          changePct: num(r.change_pct),
          priceDate: r.price_date,
        })),
      }
    },

    async add(userId: string, input: { stockId: string; groupId?: string | null; note?: string | null }) {
      const [stock] = await db.select({ id: stocks.id }).from(stocks).where(eq(stocks.id, input.stockId))
      if (!stock) throw fail(400, `查無股票 ${input.stockId}`)
      await assertOwnGroup(userId, input.groupId)

      const groupId = input.groupId ?? null
      const next = await nextItemOrder(db, userId, groupId)
      try {
        const [row] = await db
          .insert(watchlists)
          .values({ userId, stockId: input.stockId, groupId, note: input.note ?? null, sortOrder: next })
          .returning({ id: watchlists.id })
        return row!
      } catch (err) {
        if (isUniqueViolation(err)) throw fail(409, `${input.stockId} 已在自選股中`)
        throw err
      }
    },

    async update(userId: string, stockId: string, patch: ItemPatch): Promise<boolean> {
      await assertOwnGroup(userId, patch.groupId)
      return db.transaction(async (tx) => {
        const mine = and(eq(watchlists.userId, userId), eq(watchlists.stockId, stockId))
        const [current] = await tx.select({ groupId: watchlists.groupId }).from(watchlists).where(mine)
        if (!current) return false
        const set = { ...patch }
        // 換分組且沒指定順序：排到目標分組最後，避免與既有項目順序衝突
        if (patch.groupId !== undefined && patch.groupId !== current.groupId && patch.sortOrder === undefined) {
          set.sortOrder = await nextItemOrder(tx, userId, patch.groupId)
        }
        await tx.update(watchlists).set(set).where(mine)
        return true
      })
    },

    /** 一次設定某分組內的完整順序；清單必須剛好是該分組目前的股票 */
    async reorderItems(userId: string, groupId: string | null, stockIds: string[]): Promise<void> {
      await db.transaction(async (tx) => {
        const rows = await tx
          .select({ stockId: watchlists.stockId })
          .from(watchlists)
          .where(and(eq(watchlists.userId, userId), groupId ? eq(watchlists.groupId, groupId) : isNull(watchlists.groupId)))
        if (!sameSet(stockIds, rows.map((r) => r.stockId))) throw fail(400, '排序清單與分組內容不符，請重新整理後再試')
        for (const [i, stockId] of stockIds.entries()) {
          await tx
            .update(watchlists)
            .set({ sortOrder: i })
            .where(and(eq(watchlists.userId, userId), eq(watchlists.stockId, stockId)))
        }
      })
    },

    /** 一次設定所有分組順序；清單必須剛好是使用者目前的分組 */
    async reorderGroups(userId: string, ids: string[]): Promise<void> {
      await db.transaction(async (tx) => {
        const rows = await tx.select({ id: watchlistGroups.id }).from(watchlistGroups).where(eq(watchlistGroups.userId, userId))
        if (!sameSet(ids, rows.map((r) => r.id))) throw fail(400, '排序清單與分組不符，請重新整理後再試')
        for (const [i, id] of ids.entries()) {
          await tx
            .update(watchlistGroups)
            .set({ sortOrder: i })
            .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, userId)))
        }
      })
    },

    async remove(userId: string, stockId: string): Promise<boolean> {
      const rows = await db
        .delete(watchlists)
        .where(and(eq(watchlists.userId, userId), eq(watchlists.stockId, stockId)))
        .returning({ id: watchlists.id })
      return rows.length > 0
    },

    async createGroup(userId: string, input: GroupInput): Promise<GroupDto> {
      const [{ next }] = (await db
        .select({ next: sql<number>`COALESCE(MAX(${watchlistGroups.sortOrder}), -1) + 1` })
        .from(watchlistGroups)
        .where(eq(watchlistGroups.userId, userId))) as [{ next: number }]
      const [row] = await db
        .insert(watchlistGroups)
        .values({ userId, name: input.name, color: input.color ?? null, sortOrder: input.sortOrder ?? Number(next) })
        .returning(groupColumns)
      return row!
    },

    async updateGroup(userId: string, id: string, patch: Partial<GroupInput>): Promise<GroupDto | null> {
      const [row] = await db
        .update(watchlistGroups)
        .set(patch)
        .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, userId)))
        .returning(groupColumns)
      return row ?? null
    },

    /** 刪除分組；組內股票依原順序接到「未分組」最後（不刪除股票） */
    async deleteGroup(userId: string, id: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        const own = and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, userId))
        const [group] = await tx.select({ id: watchlistGroups.id }).from(watchlistGroups).where(own)
        if (!group) return false
        const base = await nextItemOrder(tx, userId, null)
        await tx.execute(sql`
          UPDATE members.watchlists w
          SET group_id = NULL, sort_order = ${base} + r.rn - 1
          FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, added_at) AS rn
            FROM members.watchlists WHERE user_id = ${userId} AND group_id = ${id}
          ) r
          WHERE w.id = r.id`)
        await tx.delete(watchlistGroups).where(own)
        return true
      })
    },
  }
}
