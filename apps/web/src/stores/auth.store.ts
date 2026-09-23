import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@tw-stock-hub/api-client'
import type { User, LoginForm, RegisterForm } from '@tw-stock-hub/types'

const ACCESS_TOKEN_KEY = 'tw_stock_access'
const REFRESH_TOKEN_KEY = 'tw_stock_refresh'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY))
  const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_TOKEN_KEY))
  const isLoading = ref(false)

  const isLoggedIn = computed(() => !!accessToken.value && !!user.value)

  function setTokens(access: string, refresh: string): void {
    accessToken.value = access
    refreshToken.value = refresh
    localStorage.setItem(ACCESS_TOKEN_KEY, access)
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  }

  function clearTokens(): void {
    accessToken.value = null
    refreshToken.value = null
    user.value = null
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }

  async function login(form: LoginForm): Promise<void> {
    isLoading.value = true
    try {
      const res = await authApi.login(form.email, form.password)
      setTokens(res.access_token, res.refresh_token)
      user.value = res.user
    } finally {
      isLoading.value = false
    }
  }

  async function register(form: RegisterForm): Promise<void> {
    isLoading.value = true
    try {
      const res = await authApi.register(form.email, form.password, form.nickname)
      setTokens(res.access_token, res.refresh_token)
      user.value = res.user
    } finally {
      isLoading.value = false
    }
  }

  async function logout(): Promise<void> {
    if (refreshToken.value) {
      try {
        await authApi.logout(refreshToken.value)
      } catch { /* 靜默失敗 */ }
    }
    clearTokens()
  }

  async function fetchMe(): Promise<void> {
    if (!accessToken.value) return
    try {
      user.value = await authApi.getMe()
    } catch {
      clearTokens()
    }
  }

  async function initializeAuth(): Promise<void> {
    if (accessToken.value && !user.value) {
      await fetchMe()
    }
  }

  return {
    user, accessToken, refreshToken, isLoading, isLoggedIn,
    setTokens, clearTokens, login, register, logout, fetchMe, initializeAuth,
  }
})
