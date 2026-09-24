import type { User } from '@tw-stock-hub/types'
import { apiClient } from '../axios'

export const authApi = {
  /** 開始 Google 登入的網址（整頁跳轉，非 XHR）；redirect 為登入後要回到的站內路徑 */
  loginUrl(redirect?: string): string {
    return redirect ? `/api/auth/google?redirect=${encodeURIComponent(redirect)}` : '/api/auth/google'
  },

  async getMe(): Promise<User> {
    const { data } = await apiClient.get<User>('/api/auth/me')
    return data
  },

  async logout(): Promise<void> {
    await apiClient.post('/api/auth/logout')
  },
}
