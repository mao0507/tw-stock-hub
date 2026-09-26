import type { Market } from './api.types'

export interface Stock {
  id: string
  name: string
  market: Market
  sector: string | null
  isActive: boolean
}

export interface StockLatestQuote extends Stock {
  latestQuote: LatestQuote | null
}

export interface DailyQuote {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  changePct: number | null
}

export interface LatestQuote extends DailyQuote {
  value: number
  change: number | null
  transactionCount: number | null
  prevClose: number | null
}

export interface Institutional {
  date: string
  foreignNet: number
  trustNet: number
  dealerNet: number
  totalNet: number
}

export interface InstitutionalRankingItem {
  stockId: string
  stockName: string
  market: string
  buyAmount: number
  sellAmount: number
  netAmount: number
}

export interface ContinuousItem {
  stockId: string
  stockName: string
  continuousDays: number
  totalNet: number
  latestClose: number
}

export interface Margin {
  date: string
  marginBalance: number
  marginChange: number
  shortBalance: number
  shortChange: number
  ratio: number | null
}

export interface MarginRankingItem {
  stockId: string
  stockName: string
  market: string
  marginBalance: number
  marginChange: number
  marginChangeRate: number
  latestClose: number
}

export interface BrokerItem {
  brokerName: string
  buy: number
  sell: number
  net: number
  tag?: string | null
}

export interface BrokerRanking {
  stockId: string
  date: string | null
  topBuy: BrokerItem[]
  topSell: BrokerItem[]
  /** 查無資料且已排入按需爬取（上市股） */
  queued: boolean
}

export interface BrokerTop {
  brokerName: string
  net: number
  tag?: string | null
}

export interface BrokerOverviewRow {
  stockId: string
  stockName: string
  brokerCount: number
  topBuy: BrokerTop[]
  topSell: BrokerTop[]
}

export interface BrokerOverview {
  date: string | null
  rows: BrokerOverviewRow[]
}

export interface BrokerLeaderItem {
  brokerName: string
  net: number
  stockCount: number
  tag?: string | null
}

export interface BrokerLeaderboard {
  date: string | null
  topBuy: BrokerLeaderItem[]
  topSell: BrokerLeaderItem[]
}

export interface BrokerStockItem {
  stockId: string
  stockName: string
  buy: number
  sell: number
  net: number
}

export interface BrokerHistoryItem {
  date: string
  net: number
}

export interface BrokerProfile {
  brokerName: string
  tag?: string | null
  date: string | null
  buys: BrokerStockItem[]
  sells: BrokerStockItem[]
  history: BrokerHistoryItem[]
}

export interface BrokerStreak {
  stockId: string
  brokerName: string
  currentStreak: number
  direction: 'buy' | 'sell' | 'none'
  streakStartDate: string | null
}

export interface BrokerConcentration {
  stockId: string
  date: string | null
  topN: number
  concentrationPct: number
  totalVolume: number
}

export interface RevenueItem {
  yearMonth: string
  revenue: number | null
  momPct: number | null
  yoyPct: number | null
  cumYoyPct: number | null
}

export interface FinancialItem {
  period: string
  revenue: number | null
  grossMargin: number | null
  opMargin: number | null
  netMargin: number | null
  eps: number | null
}

export interface DividendItem {
  year: string
  period: string
  cash: number
  stock: number
  exDate: string | null
  refPrice: number | null
  filled: boolean | null
  fillDays: number | null
  gapPct: number | null
}

export interface Valuation {
  date: string | null
  pe: number | null
  pb: number | null
  dividendYield: number | null
  ttmEps: number | null
  history: { date: string; pe: number }[]
}

export interface StockScoreBreakdownItem {
  label: string
  score: number
  weight: number
}

export interface StockScore {
  stockId: string
  composite: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  breakdown: StockScoreBreakdownItem[]
}

export interface BacktestParams {
  stockId: string
  from?: string
  to?: string
  fastPeriod?: number
  slowPeriod?: number
  initialCapital?: number
}

export interface BacktestTrade {
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  returnPct: number
}

export interface BacktestResult {
  stockId: string
  from: string | null
  to: string | null
  fastPeriod: number
  slowPeriod: number
  trades: BacktestTrade[]
  tradeCount: number
  winRate: number
  totalReturnPct: number
  maxDrawdownPct: number
  finalCapital: number
}

export interface MetricsQuarter {
  period: string
  opExpenseRatio: number | null
  nonOpToPretaxPct: number | null
  netMargin: number | null
  roe: number | null
  roa: number | null
  assetTurnover: number | null
  equityMultiplier: number | null
  inventoryDays: number | null
  receivableDays: number | null
  contractLiabToRevenuePct: number | null
}

export interface PayoutItem {
  year: string
  cashDividend: number
  eps: number | null
  payoutPct: number | null
}

export interface FinancialMetrics {
  quarters: MetricsQuarter[]
  payouts: PayoutItem[]
}

export interface HolderItem {
  date: string
  bigHolderPct: number | null
  bigHolderCount: number | null
  totalHolders: number | null
}

export interface EtfHolding {
  stockId: string
  stockName: string | null
  weight: number | null
  shares: number | null
}

export interface EtfIndustry {
  sector: string
  weight: number
}

export interface EtfHoldings {
  isEtf: boolean
  updatedDate?: string | null
  info?: [string, string][]
  industries?: EtfIndustry[]
  holdings: EtfHolding[]
}

export interface ExDividendItem {
  exDate: string
  stockId: string
  stockName: string | null
  cashDividend: number | null
  stockDividendRatio: number | null
}

export interface BrokerPriceLevel {
  price: number
  buy: number
  sell: number
}

export interface BrokerDetail {
  stockId: string
  brokerName: string
  date: string | null
  levels: BrokerPriceLevel[]
}

export interface HighRatioItem {
  stockId: string
  stockName: string
  market: string
  marginBalance: number
  shortBalance: number
  ratio: number
  latestClose: number
}

export interface StockSearchItem {
  id: string
  name: string
  market: string
  sector: string | null
}

export interface QuoteParams {
  interval?: 'daily' | 'weekly' | 'monthly'
  from?: string
  to?: string
  limit?: number
}

export interface InstitutionalParams {
  days?: number
}

export interface MarginParams {
  days?: number
}

/** 技術指標（#19，後端每日預算） */
export interface IndicatorPoint {
  date: string
  ma5: number | null
  ma10: number | null
  ma20: number | null
  ma60: number | null
  ma120: number | null
  ma240: number | null
  rsi14: number | null
  k9: number | null
  d9: number | null
  dif: number | null
  dea: number | null
  macdHist: number | null
  volMa5: number | null
  volMa20: number | null
  /** RS 相對強弱百分位 1–99（#20） */
  rsScore: number | null
}

export interface StockIndicators {
  latest: (IndicatorPoint & {
    close: number
    /** MA5 > MA10 > MA20 > MA60 */
    bullishAlignment: boolean
    aboveMa20: boolean | null
    aboveMa60: boolean | null
  }) | null
  series: IndicatorPoint[]
}
