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

/** 賣出紀錄；avgCostAtSale / realizedPnl 由後端依時間重播算出 */
export interface SellTransaction {
  id: string
  stockId: string
  soldAt: string
  price: number
  shares: number
  fee: number
  tax: number
  avgCostAtSale: number
  realizedPnl: number
}

export interface CreateSellForm {
  stockId: string
  soldAt: string
  price: number
  shares: number
  fee: number
  tax: number
}

export type UpdateSellForm = Partial<Omit<CreateSellForm, 'stockId'>>

/** 已賣光但保留已實現損益的股票 */
export interface ClosedPosition {
  stockId: string
  name: string
  realizedPnl: number
}

/** 持股（含最新收盤價與損益）；stale = 查無股價，不計入總計 */
export interface Holding {
  stockId: string
  name: string
  shares: number
  avgCost: number
  costBasis: number
  realizedPnl: number
  price: number | null
  priceDate: string | null
  stale: boolean
  marketValue: number | null
  unrealizedPnl: number | null
  returnPct: number | null
  weight: number | null
}

export interface PortfolioTotals {
  realizedPnl: number
  costBasis: number
  marketValue: number
  unrealizedPnl: number
  returnPct: number | null
  staleCount: number
}

export interface HoldingsSummary {
  items: Holding[]
  closed: ClosedPosition[]
  totals: PortfolioTotals
}
