import { round } from './replay.js'

export type PricedHolding = {
  stockId: string
  name: string
  shares: number
  avgCost: number
  costBasis: number
  price: number | null
  priceDate: string | null
}

/**
 * 算出每檔市值、未實現損益、配置比例與組合總計。
 * 沒有股價的持股標記 stale：不計入總市值、總損益與配置，但計入總成本。
 */
export function summarize(rows: readonly PricedHolding[]) {
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
    totals: {
      costBasis: round(rows.reduce((s, r) => s + r.costBasis, 0), 2),
      marketValue: round(totalMarket, 2),
      unrealizedPnl: round(unrealized, 2),
      returnPct: pricedCost > 0 ? round((unrealized / pricedCost) * 100, 2) : null,
      staleCount: rows.length - priced.length,
    },
  }
}
