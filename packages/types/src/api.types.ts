export interface ApiResponse<T> {
  success: true
  data: T
  timestamp: string
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: string[]
  }
  timestamp: string
  path: string
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginationParams {
  page?: number
  limit?: number
}

export type Market = 'TWSE' | 'TPEX' | 'ALL'
