export type NewsSource = 'mops' | 'cnyes' | 'yahoo' | 'moneydj' | 'twse'

export type NewsCategory =
  | 'major_announcement'
  | 'market_news'
  | 'analyst'
  | 'official'

export interface NewsItem {
  id: string
  title: string
  summary: string | null
  source: NewsSource
  url: string
  publishedAt: string
  category: NewsCategory
}

export interface NewsParams {
  page?: number
  limit?: number
  source?: NewsSource
  category?: NewsCategory
}

export interface MopsParams {
  from?: string
  to?: string
  stockId?: string
  page?: number
  limit?: number
}

export const NEWS_SOURCE_LABEL: Record<NewsSource, string> = {
  mops: 'MOPS',
  cnyes: '鉅亨網',
  yahoo: 'Yahoo股市',
  moneydj: 'MoneyDJ',
  twse: '證交所',
} as const

export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  major_announcement: '重大訊息',
  market_news: '市場新聞',
  analyst: '法說會',
  official: '官方公告',
} as const

export const NEWS_CATEGORY_COLOR: Record<NewsCategory, { bg: string; text: string }> = {
  major_announcement: { bg: '#EFF6FF', text: '#1A6CF5' },
  market_news: { bg: '#F5F6F8', text: '#474C56' },
  analyst: { bg: '#F5F3FF', text: '#7C3AED' },
  official: { bg: '#F0FDF4', text: '#059669' },
} as const
