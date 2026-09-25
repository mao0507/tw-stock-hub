import { round } from './replay.js'

export type PricedHolding = {
  stockId: string
  name: string
  shares: number
  avgCost: number
  costBasis: number
  realizedPnl: number
  price: number | null
  priceDate: string | null
}

/**
 * 算出每檔市值、未實現損益、配置比例與組合總計。
 * 沒有股價的持股標記 stale：不計入總市值、總損益與配置，但計入總成本。
 * 已賣光（0 股）的股票不列入持股，改列 closed 保留已實現損益。
 */
export function summarize(all: readonly PricedHolding[]) {
  const rows = all.filter((r) => r.shares > 0)
  const closed = all
    .filter((r) => r.shares === 0)
    .map((r) => ({ stockId: r.stockId, name: r.name, realizedPnl: r.realizedPnl }))
  const priced = rows.filter((r) => r.price !== null)
  const totalMarket = priced.reduce((s, r) => s + r.price! * r.shares, 0)
  const pricedCost = priced.reduce((s, r) => s + r.costBasis, 0)

  const items = rows.map((r) => {
    if (r.price === null) {
      return { ...r, stale: true, marketValue: null, unrealizedPnl: null, returnPct: null, weight: null }
    }
    const marketValue = r.price * r.shares
    const pnl = marketValue - r.costBasis
    return {
      ...r,
      stale: false,
      marketValue: round(marketValue, 2),
      unrealizedPnl: round(pnl, 2),
      returnPct: r.costBasis > 0 ? round((pnl / r.costBasis) * 100, 2) : null,
      weight: totalMarket > 0 ? round((marketValue / totalMarket) * 100, 2) : null,
    }
  })

  const unrealized = totalMarket - pricedCost
  return {
    items,
    closed,
    totals: {
      realizedPnl: round(all.reduce((s, r) => s + r.realizedPnl, 0), 2),
      costBasis: round(rows.reduce((s, r) => s + r.costBasis, 0), 2),
      marketValue: round(totalMarket, 2),
      unrealizedPnl: round(unrealized, 2),
      returnPct: pricedCost > 0 ? round((unrealized / pricedCost) * 100, 2) : null,
      staleCount: rows.length - priced.length,
    },
  }
}
