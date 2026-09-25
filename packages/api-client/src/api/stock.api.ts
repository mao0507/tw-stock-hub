import type {
  MarketOverview, SectorHeatmapItem, MarketHistoryItem, MarketHistoryParams, SectorStocks,
  StockLatestQuote, StockSearchItem, DailyQuote, QuoteParams,
  Institutional, InstitutionalParams, InstitutionalRankingItem,
  Margin, MarginParams, MarginRankingItem, HighRatioItem,
  BrokerRanking, BrokerOverview, BrokerLeaderboard, BrokerDetail, BrokerProfile,
  BrokerStreak, BrokerConcentration,
  RevenueItem, FinancialItem, DividendItem, Valuation, HolderItem, ExDividendItem, EtfHoldings,
  FinancialMetrics,
  StockScore, BacktestParams, BacktestResult,
  ContinuousItem, NewsItem, NewsParams, MopsParams,
  ScreenerFilter, ScreenerResponse, PaginatedResponse, Market,
} from '@tw-stock-hub/types'
import { apiClient } from '../axios'

export const stockApi = {
  async getMarketOverview(): Promise<MarketOverview> {
    const { data } = await apiClient.get<MarketOverview>('/api/market/overview')
    return data
  },

  async getMarketHeatmap(): Promise<{ date: string; sectors: SectorHeatmapItem[] }> {
    const { data } = await apiClient.get('/api/market/heatmap')
    return data
  },

  async getSectorStocks(sector: string): Promise<SectorStocks> {
    const { data } = await apiClient.get('/api/market/sector-stocks', { params: { sector } })
    return data
  },

  async getMarketHistory(params: MarketHistoryParams): Promise<MarketHistoryItem[]> {
    const { data } = await apiClient.get('/api/market/history', { params })
    return data
  },

  async searchStocks(q: string, market: Market = 'ALL', limit = 10): Promise<StockSearchItem[]> {
    const { data } = await apiClient.get('/api/stocks/search', { params: { q, market, limit } })
    return data
  },

  async getStockDetail(id: string): Promise<StockLatestQuote> {
    const { data } = await apiClient.get(`/api/stocks/${id}`)
    return data
  },

  async getStockQuote(id: string, params: QuoteParams = {}): Promise<DailyQuote[]> {
    const { data } = await apiClient.get(`/api/stocks/${id}/quote`, { params })
    return data
  },

  async getStockInstitutional(id: string, params: InstitutionalParams = {}): Promise<Institutional[]> {
    const { data } = await apiClient.get(`/api/stocks/${id}/institutional`, { params })
    return data
  },

  async getStockMargin(id: string, params: MarginParams = {}): Promise<Margin[]> {
    const { data } = await apiClient.get(`/api/stocks/${id}/margin`, { params })
    return data
  },

  async getStockNews(id: string, params: NewsParams = {}): Promise<PaginatedResponse<NewsItem>> {
    const { data } = await apiClient.get(`/api/stocks/${id}/news`, { params })
    return data
  },

  async getInstitutionalRanking(params: {
    date?: string; market?: Market; type?: string; order?: string; limit?: number
  } = {}): Promise<InstitutionalRankingItem[]> {
    const { data } = await apiClient.get('/api/institutional/ranking', { params })
    return data
  },

  async getInstitutionalContinuous(params: {
    days?: number; direction?: string; type?: string; market?: Market
  } = {}): Promise<ContinuousItem[]> {
    const { data } = await apiClient.get('/api/institutional/continuous', { params })
    return data
  },

  async getMarginRanking(params: {
    date?: string; order?: string; market?: Market; limit?: number
  } = {}): Promise<MarginRankingItem[]> {
    const { data } = await apiClient.get('/api/margin/ranking', { params })
    return data
  },

  async getBrokerRanking(params: {
    stockId: string; date?: string; limit?: number
  }): Promise<BrokerRanking> {
    // 冷門股可能觸發即時爬取，需較長 timeout
    const { data } = await apiClient.get('/api/broker/ranking', { params, timeout: 35_000 })
    return data
  },

  async getBrokerOverview(): Promise<BrokerOverview> {
    const { data } = await apiClient.get('/api/broker/overview')
    return data
  },

  // ── 基本面
  async getRevenue(id: string): Promise<RevenueItem[]> {
    const { data } = await apiClient.get(`/api/stocks/${id}/revenue`)
    return data
  },
  async getFinancials(id: string): Promise<FinancialItem[]> {
    const { data } = await apiClient.get(`/api/stocks/${id}/financials`)
    return data
  },
  async getMetrics(id: string): Promise<FinancialMetrics> {
    const { data } = await apiClient.get(`/api/stocks/${id}/metrics`)
    return data
  },
  async getDividends(id: string): Promise<DividendItem[]> {
    const { data } = await apiClient.get(`/api/stocks/${id}/dividends`)
    return data
  },
  async getValuation(id: string): Promise<Valuation> {
    const { data } = await apiClient.get(`/api/stocks/${id}/valuation`)
    return data
  },
  async getHolders(id: string): Promise<HolderItem[]> {
    const { data } = await apiClient.get(`/api/stocks/${id}/holders`)
    return data
  },
  async getEtfHoldings(id: string): Promise<EtfHoldings> {
    const { data } = await apiClient.get(`/api/stocks/${id}/etf-holdings`, { timeout: 30_000 })
    return data
  },
  async getScore(id: string): Promise<StockScore> {
    const { data } = await apiClient.get(`/api/stocks/${id}/score`)
    return data
  },
  async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    const { data } = await apiClient.get('/api/backtest', { params })
    return data
  },
  async getExDividendCalendar(from: string, to: string): Promise<ExDividendItem[]> {
    const { data } = await apiClient.get('/api/calendar/ex-dividend', { params: { from, to } })
    return data
  },

  async getBrokerLeaderboard(params: { limit?: number } = {}): Promise<BrokerLeaderboard> {
    const { data } = await apiClient.get('/api/broker/leaderboard', { params })
    return data
  },

  async getBrokerDetail(params: {
    stockId: string; brokerName: string; date?: string
  }): Promise<BrokerDetail> {
    const { data } = await apiClient.get('/api/broker/detail', { params })
    return data
  },

  async getBrokerProfile(params: { brokerName: string }): Promise<BrokerProfile> {
    const { data } = await apiClient.get('/api/broker/profile', { params })
    return data
  },

  async getBrokerStreak(params: { stockId: string; brokerName: string }): Promise<BrokerStreak> {
    const { data } = await apiClient.get('/api/broker/streak', { params })
    return data
  },

  async getBrokerConcentration(params: {
    stockId: string; date?: string; topN?: number
  }): Promise<BrokerConcentration> {
    const { data } = await apiClient.get('/api/broker/concentration', { params })
    return data
  },

  async getHighRatioStocks(params: {
    threshold?: number; market?: Market; limit?: number
  } = {}): Promise<HighRatioItem[]> {
    const { data } = await apiClient.get('/api/margin/high-ratio', { params })
    return data
  },

  async screenStocks(filter: ScreenerFilter): Promise<ScreenerResponse> {
    const { data } = await apiClient.post('/api/screener', filter)
    return data
  },

  async getLatestNews(params: NewsParams = {}): Promise<PaginatedResponse<NewsItem>> {
    const { data } = await apiClient.get('/api/news/latest', { params })
    return data
  },

  async getMopsAnnouncements(params: MopsParams = {}): Promise<PaginatedResponse<NewsItem>> {
    const { data } = await apiClient.get('/api/news/mops', { params })
    return data
  },
}
