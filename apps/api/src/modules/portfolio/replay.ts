// 依時間重播交易事件，推導持股狀態。#12 會在這裡加入賣出事件。

export type BuyEvent = { date: string; price: number; shares: number; fee: number }

export type Position = { shares: number; costBasis: number; avgCost: number }

export const round = (n: number, dp: number) => {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}

/**
 * 加權平均成本：每批成本 = 價格 × 股數 + 手續費；均價 = 總成本 ÷ 總股數。
 * ponytail: 以 JS number 計算並在輸出時四捨五入；台股金額量級內誤差遠小於 0.01，出現對帳差異再換 decimal 函式庫。
 */
export function replay(buys: readonly BuyEvent[]): Position {
  let shares = 0
  let cost = 0
  for (const b of [...buys].sort((x, y) => x.date.localeCompare(y.date))) {
    shares += b.shares
    cost += b.price * b.shares + b.fee
  }
  return {
    shares,
    costBasis: round(cost, 2),
    avgCost: shares > 0 ? round(cost / shares, 4) : 0,
  }
}
