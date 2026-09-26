/** GET /api/auth/me 回傳的登入使用者 */
export interface User {
  id: string
  email: string
  nickname: string
  avatarUrl: string | null
}


/** 盤後提醒類型（#26）：價格（元）、漲跌幅（%，跌幅以正數表示）、成交量（張） */
export type AlertType = 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_above'

export interface AlertItem {
  id: string
  stockId: string
  stockName: string
  alertType: AlertType
  threshold: number
  isTriggered: boolean
  triggeredAt: string | null
  isActive: boolean
  createdAt: string
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  stockId: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  unreadCount: number
  items: NotificationItem[]
}

export interface CreateAlertForm {
  stockId: string
  alertType: AlertType
  threshold: number
}
