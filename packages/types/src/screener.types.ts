import type { Market } from './api.types'

/** 選股條件（#21）：全部選填、AND 組合。成交量、法人淨買超、融資增減單位為「張」。 */
export interface ScreenerFilter {
  market?: Market
  sector?: string
  // 行情籌碼
  priceMin?: number
  priceMax?: number
  changeMin?: number
  changeMax?: number
  volumeMin?: number
  foreignNetMin?: number
  trustNetMin?: number
  marginChangeMin?: number
  // 技術趨勢
  bullishAlignment?: boolean
  aboveMa20?: boolean
  aboveMa60?: boolean
  rsMin?: number
  // 基本面
  peMin?: number
  peMax?: number
  pbMax?: number
  yieldMin?: number
  grossMarginMin?: number
  revenueYoyMin?: number
  dividendYearsMin?: number
  bigHolderMin?: number
  // 排序與筆數
  sortBy?: ScreenerSortKey
  order?: 'asc' | 'desc'
  limit?: number
}

export type ScreenerSortKey =
  | 'changePct' | 'volume' | 'close' | 'foreignNet' | 'rsScore'
  | 'pe' | 'dividendYield' | 'grossMargin' | 'revenueYoy' | 'dividendYears'

export interface ScreenerResult {
  stockId: string
  stockName: string
  market: string
  sector: string | null
  close: number
  changePct: number | null
  volume: number
  foreignNet: number | null
  trustNet: number | null
  marginChange: number | null
  rsScore: number | null
  bullishAlignment: boolean
  aboveMa20: boolean | null
  aboveMa60: boolean | null
  pe: number | null
  pb: number | null
  dividendYield: number | null
  grossMargin: number | null
  revenueYoy: number | null
  dividendYears: number
  bigHolderPct: number | null
}

export interface ScreenerResponse {
  total: number
  items: ScreenerResult[]
}
