export type AuthProvider = 'local' | 'google' | 'both'

export interface User {
  id: string
  email: string
  nickname: string
  avatarUrl: string | null
  authProvider: AuthProvider
  createdAt: string
}

export interface WatchlistItem {
  id: string
  stockId: string
  note: string | null
  addedAt: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
}

export interface AuthResponse extends AuthTokens {
  user: User
}

export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  email: string
  password: string
  nickname: string
}

export interface UpdateUserForm {
  nickname?: string
  currentPassword?: string
  newPassword?: string
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
