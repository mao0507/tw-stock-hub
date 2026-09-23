export interface MarketOverview {
  date: string
  taiexClose: number
  taiexChange: number
  taiexChangePct: number
  totalValue: number
  totalVolume: number
  upCount: number
  downCount: number
  flatCount: number
  limitUpCount: number
  limitDownCount: number
  taiexOpen: number | null
  taiexHigh: number | null
  taiexLow: number | null
  taiexPrevClose: number | null
}

export interface SectorHeatmapItem {
  sectorName: string
  changePct: number
  value: number
  volume: number
}

export interface SectorStockItem {
  stockId: string
  stockName: string
  close: number | null
  changePct: number | null
  value: number | null
}

export interface SectorStocks {
  sector: string
  date: string | null
  stocks: SectorStockItem[]
}

export interface MarketHistoryItem {
  date: string
  close: number
  change: number
  changePct: number
  totalValue: number
}

export interface MarketHistoryParams {
  from?: string
  to?: string
  interval?: 'daily' | 'weekly' | 'monthly'
  limit?: number
}
