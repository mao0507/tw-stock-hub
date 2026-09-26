import { and, asc, eq, gt, isNotNull, lte, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { Db } from '../../db/client.js'
import { dividendEntitlements, holdingLots, holdings, sellTransactions } from '../../db/schema/members.js'
import { dividends, exDividendCalendar, stocks } from '../../db/schema/stocks.js'
import { todayInTaipei } from './dates.js'
import { replay, round, type TradeEvent } from './replay.js'

/**
 * 上限讓最大成本（價 × 股）落在 holdings.cost_basis numeric(16,2) 與 shares int4 內，
 * 超過時回 400 而不是讓 DB 溢位變成 500。
 */
export const MAX_PRICE = 100_000
export const MAX_TOTAL_SHARES = 100_000_000

const fail = (status: 400 | 409, body: Record<string, unknown>) =>
  new HTTPException(status, { res: Response.json(body, { status }) })

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type LotInput = { stockId: string; boughtAt: string; price: number; shares: number; fee: number }
export type LotDto = LotInput & { id: string }
export type SellInput = { stockId: string; soldAt: string; price: number; shares: number; fee: number; tax: number }
export type SellDto = SellInput & { id: string; avgCostAtSale: number; realizedPnl: number }

const lotColumns = {
  id: holdingLots.id,
  stockId: holdingLots.stockId,
  boughtAt: holdingLots.boughtAt,
  price: holdingLots.price,
  shares: holdingLots.shares,
  fee: holdingLots.fee,
}

const toLot = (r: { id: string; stockId: string; boughtAt: string; price: string; shares: number; fee: string }): LotDto => ({
  ...r,
  price: Number(r.price),
  fee: Number(r.fee),
})

const sellColumns = {
  id: sellTransactions.id,
  stockId: sellTransactions.stockId,
  soldAt: sellTransactions.soldAt,
  price: sellTransactions.price,
  shares: sellTransactions.shares,
  fee: sellTransactions.fee,
  tax: sellTransactions.tax,
  avgCostAtSale: sellTransactions.avgCostAtSale,
  realizedPnl: sellTransactions.realizedPnl,
}

type SellRow = { [K in keyof typeof sellColumns]: K extends 'shares' ? number : string }

const toSell = (r: SellRow): SellDto => ({
  id: r.id,
  stockId: r.stockId,
  soldAt: r.soldAt,
  price: Number(r.price),
  shares: r.shares,
  fee: Number(r.fee),
  tax: Number(r.tax),
  avgCostAtSale: Number(r.avgCostAtSale),
  realizedPnl: Number(r.realizedPnl),
})

const money = (n: number | undefined) => (n === undefined ? undefined : String(n))

/** 同一使用者同一檔股票的重算互斥，避免並發修改算出錯的彙總 */
async function lockPosition(tx: Tx, userId: string, stockId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId} || ':' || ${stockId}))`)
}

/**
 * 由 holding_lots + sell_transactions 依時間重播：回寫每筆賣出的均價與已實現損益，並覆寫 holdings。
 * 任一時點超賣則丟 409（transaction 回滾）；完全沒有交易才刪除 holdings 列（賣光仍保留已實現損益）。
 */
async function recompute(tx: Tx, userId: string, stockId: string) {
  const mine = (t: typeof holdingLots | typeof sellTransactions | typeof dividendEntitlements) => and(eq(t.userId, userId), eq(t.stockId, stockId))
  const today = todayInTaipei()
  const [lots, sells, calendarDivs, historyDivs] = await Promise.all([
    tx.select().from(holdingLots).where(mine(holdingLots)).orderBy(asc(holdingLots.createdAt)),
    tx.select().from(sellTransactions).where(mine(sellTransactions)).orderBy(asc(sellTransactions.createdAt)),
    // 已到除息日（含今天）且有現金股利的才列入已領
    tx
      .select({ exDate: exDividendCalendar.exDate, cash: exDividendCalendar.cashDividend })
      .from(exDividendCalendar)
      .where(
        and(
          eq(exDividendCalendar.stockId, stockId),
          lte(exDividendCalendar.exDate, today),
          isNotNull(exDividendCalendar.cashDividend),
          gt(exDividendCalendar.cashDividend, '0'),
        ),
      ),
    // 歷史股利（行事曆只有近期預告）；沒有除息日的無法判斷當時持股，不列入
    tx
      .select({ exDate: dividends.exDividendDate, cash: dividends.cashDividend })
      .from(dividends)
      .where(
        and(
          eq(dividends.stockId, stockId),
          isNotNull(dividends.exDividendDate),
          lte(dividends.exDividendDate, today),
          gt(dividends.cashDividend, '0'),
        ),
      ),
  ])
  // 同一除息日兩邊都有 → 以行事曆為準，只算一次
  const byDate = new Map<string, number>()
  for (const d of historyDivs) byDate.set(d.exDate!, Number(d.cash))
  for (const d of calendarDivs) byDate.set(d.exDate, Number(d.cash))
  const exDivs = [...byDate].map(([exDate, cash]) => ({ exDate, cash }))
  const events: TradeEvent[] = [
    ...lots.map((l, seq) => ({
      kind: 'buy' as const, date: l.boughtAt, seq, price: Number(l.price), shares: l.shares, fee: Number(l.fee),
    })),
    ...sells.map((x, seq) => ({
      kind: 'sell' as const, id: x.id, date: x.soldAt, seq,
      price: Number(x.price), shares: x.shares, fee: Number(x.fee), tax: Number(x.tax),
    })),
    ...exDivs.map((d, seq) => ({ kind: 'dividend' as const, date: d.exDate, seq, cashPerShare: d.cash })),
  ]
  const r = replay(events)

  if (!r.ok) {
    throw fail(409, {
      error: `${r.date} 的賣出超賣：當時持有 ${r.held} 股，賣出 ${r.selling} 股`,
      sellId: r.oversoldSellId,
    })
  }
  if (r.shares > MAX_TOTAL_SHARES) {
    throw fail(400, { error: `${stockId} 累計股數超過上限 ${MAX_TOTAL_SHARES.toLocaleString()} 股` })
  }

  for (const s of r.sells) {
    await tx
      .update(sellTransactions)
      .set({ avgCostAtSale: String(s.avgCostAtSale), realizedPnl: String(s.realizedPnl) })
      .where(eq(sellTransactions.id, s.id))
  }

  const tradeCount = lots.length + sells.length
  await tx.delete(dividendEntitlements).where(mine(dividendEntitlements))
  if (tradeCount > 0 && r.dividends.length > 0) {
    await tx.insert(dividendEntitlements).values(
      r.dividends.map((d) => ({
        userId,
        stockId,
        exDate: d.exDate,
        cashPerShare: String(d.cashPerShare),
        shares: d.shares,
        amount: String(d.amount),
      })),
    )
  }

  if (tradeCount === 0) {
    await tx.delete(holdings).where(and(eq(holdings.userId, userId), eq(holdings.stockId, stockId)))
    return
  }
  const values = {
    shares: r.shares,
    avgCost: String(r.avgCost),
    costBasis: String(r.costBasis),
    realizedPnl: String(r.realizedPnl),
    earnedDividend: String(r.earnedDividend),
    updatedAt: new Date(),
  }
  await tx
    .insert(holdings)
    .values({ userId, stockId, ...values })
    .onConflictDoUpdate({ target: [holdings.userId, holdings.stockId], set: values })
}

export function createPortfolioRepository(db: Db) {
  /** 在 transaction 內變更批次並重算受影響股票的持股 */
  async function mutate<T>(userId: string, stockIds: string[], fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      const unique = [...new Set(stockIds)].sort()
      for (const s of unique) await lockPosition(tx, userId, s)
      const result = await fn(tx)
      for (const s of unique) await recompute(tx, userId, s)
      return result
    })
  }

  return {
    async stockExists(stockId: string): Promise<boolean> {
      const [row] = await db.select({ id: stocks.id }).from(stocks).where(eq(stocks.id, stockId))
      return !!row
    },

    async listLots(userId: string, stockId?: string): Promise<LotDto[]> {
      const rows = await db
        .select(lotColumns)
        .from(holdingLots)
        .where(and(eq(holdingLots.userId, userId), stockId ? eq(holdingLots.stockId, stockId) : undefined))
        .orderBy(asc(holdingLots.boughtAt), asc(holdingLots.createdAt))
      return rows.map(toLot)
    },

    async createLot(userId: string, input: LotInput): Promise<LotDto> {
      return mutate(userId, [input.stockId], async (tx) => {
        const [row] = await tx
          .insert(holdingLots)
          .values({ userId, ...input, price: String(input.price), fee: String(input.fee) })
          .returning(lotColumns)
        return toLot(row!)
      })
    },

    /** 找不到（或不屬於此使用者）回 null */
    async updateLot(userId: string, id: string, patch: Partial<Omit<LotInput, 'stockId'>>): Promise<LotDto | null> {
      const [current] = await db
        .select({ stockId: holdingLots.stockId })
        .from(holdingLots)
        .where(and(eq(holdingLots.id, id), eq(holdingLots.userId, userId)))
      if (!current) return null
      return mutate(userId, [current.stockId], async (tx) => {
        const [row] = await tx
          .update(holdingLots)
          .set({
            ...patch,
            price: money(patch.price),
            fee: money(patch.fee),
          })
          .where(and(eq(holdingLots.id, id), eq(holdingLots.userId, userId)))
          .returning(lotColumns)
        return row ? toLot(row) : null
      })
    },

    async deleteLot(userId: string, id: string): Promise<boolean> {
      const [current] = await db
        .select({ stockId: holdingLots.stockId })
        .from(holdingLots)
        .where(and(eq(holdingLots.id, id), eq(holdingLots.userId, userId)))
      if (!current) return false
      return mutate(userId, [current.stockId], async (tx) => {
        const rows = await tx
          .delete(holdingLots)
          .where(and(eq(holdingLots.id, id), eq(holdingLots.userId, userId)))
          .returning({ id: holdingLots.id })
        return rows.length > 0
      })
    },

    async listSells(userId: string, stockId?: string): Promise<SellDto[]> {
      const rows = await db
        .select(sellColumns)
        .from(sellTransactions)
        .where(and(eq(sellTransactions.userId, userId), stockId ? eq(sellTransactions.stockId, stockId) : undefined))
        .orderBy(asc(sellTransactions.soldAt), asc(sellTransactions.createdAt))
      return rows.map(toSell)
    },

    async createSell(userId: string, input: SellInput): Promise<SellDto> {
      const id = await mutate(userId, [input.stockId], async (tx) => {
        const [row] = await tx
          .insert(sellTransactions)
          .values({
            userId,
            ...input,
            price: String(input.price),
            fee: String(input.fee),
            tax: String(input.tax),
            // 由 recompute 依重播結果回寫
            avgCostAtSale: '0',
            realizedPnl: '0',
          })
          .returning({ id: sellTransactions.id })
        return row!.id
      })
      return (await this.getSell(userId, id))!
    },

    async getSell(userId: string, id: string): Promise<SellDto | null> {
      const [row] = await db
        .select(sellColumns)
        .from(sellTransactions)
        .where(and(eq(sellTransactions.id, id), eq(sellTransactions.userId, userId)))
      return row ? toSell(row) : null
    },

    async updateSell(userId: string, id: string, patch: Partial<Omit<SellInput, 'stockId'>>): Promise<SellDto | null> {
      const current = await this.getSell(userId, id)
      if (!current) return null
      await mutate(userId, [current.stockId], (tx) =>
        tx
          .update(sellTransactions)
          .set({ ...patch, price: money(patch.price), fee: money(patch.fee), tax: money(patch.tax) })
          .where(and(eq(sellTransactions.id, id), eq(sellTransactions.userId, userId))),
      )
      return this.getSell(userId, id)
    },

    async deleteSell(userId: string, id: string): Promise<boolean> {
      const current = await this.getSell(userId, id)
      if (!current) return false
      await mutate(userId, [current.stockId], (tx) =>
        tx.delete(sellTransactions).where(and(eq(sellTransactions.id, id), eq(sellTransactions.userId, userId))),
      )
      return true
    },

    async listDividends(userId: string, stockId?: string) {
      const rows = await db
        .select()
        .from(dividendEntitlements)
        .where(
          and(eq(dividendEntitlements.userId, userId), stockId ? eq(dividendEntitlements.stockId, stockId) : undefined),
        )
        .orderBy(asc(dividendEntitlements.exDate), asc(dividendEntitlements.stockId))
      return rows.map((r) => ({
        stockId: r.stockId,
        exDate: r.exDate,
        cashPerShare: Number(r.cashPerShare),
        shares: r.shares,
        amount: Number(r.amount),
      }))
    },

    /**
     * 除權息資料更新後：重算所有有交易紀錄的使用者持股（含股利權利）。
     * 單一持股失敗（例如舊資料超賣）只記錄並略過，不中斷其他人。
     * ponytail: 逐檔序列重算，使用者/持股多到拖慢啟動時再改為只重算有新除息資料的股票。
     */
    async recomputeAllPositions(): Promise<{ updated: number; failed: number }> {
      const pairs = await db.selectDistinct({ userId: holdings.userId, stockId: holdings.stockId }).from(holdings)
      let failed = 0
      for (const p of pairs) {
        try {
          await mutate(p.userId, [p.stockId], async () => undefined)
        } catch (err) {
          failed++
          console.error(`[portfolio] 重算持股失敗 user=${p.userId} stock=${p.stockId}`, err)
        }
      }
      return { updated: pairs.length - failed, failed }
    },

    /** 持股 + 最新收盤價（同一 DB 內 LATERAL JOIN stocks schema） */
    async holdingsWithPrice(userId: string) {
      const rows = await db.execute<{
        stock_id: string
        name: string | null
        shares: number
        avg_cost: string
        cost_basis: string
        realized_pnl: string
        earned_dividend: string
        close: string | null
        price_date: string | null
      }>(sql`
        SELECT h.stock_id, s.name, h.shares, h.avg_cost, h.cost_basis, h.realized_pnl, h.earned_dividend, q.close, q.date::text AS price_date
        FROM members.holdings h
        LEFT JOIN stocks.stocks s ON s.id = h.stock_id
        LEFT JOIN LATERAL (
          SELECT close, date FROM stocks.daily_quotes
          WHERE stock_id = h.stock_id ORDER BY date DESC LIMIT 1
        ) q ON TRUE
        WHERE h.user_id = ${userId}
        ORDER BY h.stock_id`)
      return rows.map((r) => ({
        stockId: r.stock_id,
        name: r.name ?? r.stock_id,
        shares: r.shares,
        avgCost: round(Number(r.avg_cost), 4),
        costBasis: Number(r.cost_basis),
        realizedPnl: Number(r.realized_pnl),
        earnedDividend: Number(r.earned_dividend),
        price: r.close === null ? null : Number(r.close),
        priceDate: r.price_date,
      }))
    },
  }
}
