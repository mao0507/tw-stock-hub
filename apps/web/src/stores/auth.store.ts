import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@tw-stock-hub/api-client'
import type { User } from '@tw-stock-hub/types'

// 登入狀態存在 httpOnly cookie（JS 讀不到）；這裡只快取 /api/auth/me 的結果。
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isLoggedIn = computed(() => !!user.value)
  let initializing: Promise<void> | null = null

  async function fetchMe(): Promise<void> {
    try {
      user.value = await authApi.getMe()
    } catch (e) {
      user.value = null
      // 只有 401 代表「確定是訪客」；網路或 5xx 錯誤讓下一次導覽重試
      if ((e as { response?: { status?: number } })?.response?.status !== 401) initializing = null
    }
  }

  /** 確定登入狀態前只打一次 /me；並發呼叫共用同一個 Promise。 */
  function initializeAuth(): Promise<void> {
    initializing ??= fetchMe()
    return initializing
  }

  function login(redirect?: string): void {
    window.location.href = authApi.loginUrl(redirect)
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch { /* cookie 失效時 API 可能失敗，前端狀態照樣清除 */ }
    user.value = null
  }

  return { user, isLoggedIn, fetchMe, initializeAuth, login, logout }
})
