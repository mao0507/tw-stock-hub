import type { Market } from './api.types'

export interface ScreenerFilter {
  priceMin?: number
  priceMax?: number
  changeMin?: number
  changeMax?: number
  volumeMin?: number
  foreignNetMin?: number
  trustNetMin?: number
  marginChangeMin?: number
  market?: Market
  sector?: string
}

export interface ScreenerResult {
  stockId: string
  stockName: string
  market: string
  sector: string | null
  close: number
  changePct: number | null
  volume: number
  foreignNet: number | null
  marginChange: number | null
}

export interface ScreenerResponse {
  total: number
  items: ScreenerResult[]
}
