/** GET /api/auth/me 回傳的登入使用者 */
export interface User {
  id: string
  email: string
  nickname: string
  avatarUrl: string | null
}

export interface WatchlistItem {
  id: string
  stockId: string
  note: string | null
  addedAt: string
}

export interface AddWatchlistForm {
  stockId: string
  note?: string
}

export type AlertType = 'price_above' | 'price_below' | 'volume_above'

export interface AlertItem {
  id: string
  stockId: string
  alertType: AlertType
  threshold: number
  isTriggered: boolean
  isActive: boolean
  createdAt: string
}

export interface CreateAlertForm {
  stockId: string
  alertType: AlertType
  threshold: number
}
