/** 買入批次 */
export interface HoldingLot {
  id: string
  stockId: string
  boughtAt: string
  price: number
  shares: number
  fee: number
}

export interface CreateLotForm {
  stockId: string
  boughtAt: string
  price: number
  shares: number
  fee: number
}

export type UpdateLotForm = Partial<Omit<CreateLotForm, 'stockId'>>

/** 持股（含最新收盤價與損益）；stale = 查無股價，不計入總計 */
export interface Holding {
  stockId: string
  name: string
  shares: number
  avgCost: number
  costBasis: number
  price: number | null
  priceDate: string | null
  stale: boolean
  marketValue: number | null
  unrealizedPnl: number | null
  returnPct: number | null
  weight: number | null
}

export interface PortfolioTotals {
  costBasis: number
  marketValue: number
  unrealizedPnl: number
  returnPct: number | null
  staleCount: number
}

export interface HoldingsSummary {
  items: Holding[]
  totals: PortfolioTotals
}
