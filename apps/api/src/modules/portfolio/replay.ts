// 依時間重播買賣事件，推導持股狀態與每筆賣出的已實現損益。

export type BuyEvent = { kind: 'buy'; date: string; seq: number; price: number; shares: number; fee: number }
export type SellEvent = {
  kind: 'sell'
  id: string
  date: string
  seq: number
  price: number
  shares: number
  fee: number
  tax: number
}
/** 除息事件：當天開盤前的持股即為應領股數 */
export type DividendEvent = { kind: 'dividend'; date: string; seq: number; cashPerShare: number }
export type TradeEvent = BuyEvent | SellEvent | DividendEvent

export type Entitlement = { exDate: string; cashPerShare: number; shares: number; amount: number }

export type SellResult = { id: string; avgCostAtSale: number; realizedPnl: number }

export type ReplayResult =
  | {
      ok: true
      shares: number
      costBasis: number
      avgCost: number
      realizedPnl: number
      sells: SellResult[]
      dividends: Entitlement[]
      earnedDividend: number
    }
  | { ok: false; oversoldSellId: string; date: string; held: number; selling: number }

export const round = (n: number, dp: number) => {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}

/**
 * 日期升冪；同一天：除息 → 買入 → 賣出；再依建立順序。
 * 除息排最前 = 除息日當天買入不算、當天賣出仍算（除息日前一天收盤持有才有權利）。
 */
const KIND_ORDER = { dividend: 0, buy: 1, sell: 2 } as const
const byTime = (a: TradeEvent, b: TradeEvent) =>
  a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.seq - b.seq

/**
 * 加權平均成本法：
 * - 買入：總成本 += 價 × 股 + 手續費；均價 = 總成本 ÷ 總股數
 * - 賣出：均價不變，總成本按比例扣除；已實現損益 = 價 × 股 − 手續費 − 稅 − 均價 × 股
 * - 持股歸零時總成本歸零，之後的買入重新計算
 * - 除息：以當下持股 × 每股現金股利記一筆應領股利（持股為 0 不記）
 * 任一時點持股為負即回報超賣的那筆賣出。
 * ponytail: JS number 計算、輸出時四捨五入；台股金額量級誤差遠小於 0.01，出現對帳差異再換 decimal 函式庫。
 */
export function replay(events: readonly TradeEvent[]): ReplayResult {
  let shares = 0
  let cost = 0
  let realized = 0
  const sells: SellResult[] = []
  const dividends: Entitlement[] = []

  for (const e of [...events].sort(byTime)) {
    if (e.kind === 'dividend') {
      if (shares > 0) {
        dividends.push({
          exDate: e.date,
          cashPerShare: e.cashPerShare,
          shares,
          amount: round(shares * e.cashPerShare, 2),
        })
      }
      continue
    }
    if (e.kind === 'buy') {
      shares += e.shares
      cost += e.price * e.shares + e.fee
      continue
    }
    if (e.shares > shares) {
      return { ok: false, oversoldSellId: e.id, date: e.date, held: shares, selling: e.shares }
    }
    const avg = cost / shares
    const pnl = e.price * e.shares - e.fee - e.tax - avg * e.shares
    shares -= e.shares
    cost = shares === 0 ? 0 : cost - avg * e.shares
    realized += pnl
    sells.push({ id: e.id, avgCostAtSale: round(avg, 4), realizedPnl: round(pnl, 2) })
  }

  return {
    ok: true,
    shares,
    costBasis: round(cost, 2),
    avgCost: shares > 0 ? round(cost / shares, 4) : 0,
    realizedPnl: round(realized, 2),
    sells,
    dividends,
    earnedDividend: round(dividends.reduce((s, d) => s + d.amount, 0), 2),
  }
}
