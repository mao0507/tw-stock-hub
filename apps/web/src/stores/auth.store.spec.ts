import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from './auth.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  authApi: {
    getMe: vi.fn(),
    logout: vi.fn(),
    loginUrl: (redirect?: string) => `/api/auth/google${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`,
  },
}))

import { authApi } from '@tw-stock-hub/api-client'

const me = { id: 'u1', email: 'a@a.com', nickname: 'a', avatarUrl: null }

describe('useAuthStore（cookie 登入）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始狀態未登入', () => {
    expect(useAuthStore().isLoggedIn).toBe(false)
  })

  it('initializeAuth：/me 成功即視為已登入', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(me)
    const store = useAuthStore()
    await store.initializeAuth()
    expect(store.isLoggedIn).toBe(true)
    expect(store.user?.nickname).toBe('a')
  })

  it('initializeAuth：/me 回 401 時保持訪客狀態', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue({ response: { status: 401 } })
    const store = useAuthStore()
    await store.initializeAuth()
    expect(store.isLoggedIn).toBe(false)
  })

  it('initializeAuth 只打一次 /me', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(me)
    const store = useAuthStore()
    await Promise.all([store.initializeAuth(), store.initializeAuth()])
    await store.initializeAuth()
    expect(authApi.getMe).toHaveBeenCalledTimes(1)
  })

  it('/me 非 401 錯誤（網路、5xx）時，下次呼叫會重試', async () => {
    vi.mocked(authApi.getMe).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(me)
    const store = useAuthStore()
    await store.initializeAuth()
    expect(store.isLoggedIn).toBe(false)
    await store.initializeAuth()
    expect(store.isLoggedIn).toBe(true)
    expect(authApi.getMe).toHaveBeenCalledTimes(2)
  })

  it('/me 回 401 後不再重試', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue({ response: { status: 401 } })
    const store = useAuthStore()
    await store.initializeAuth()
    await store.initializeAuth()
    expect(authApi.getMe).toHaveBeenCalledTimes(1)
  })

  it('logout 清除使用者，即使 API 失敗', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(me)
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network'))
    const store = useAuthStore()
    await store.initializeAuth()
    await store.logout()
    expect(store.isLoggedIn).toBe(false)
  })

  it('不再使用 localStorage 存 token', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(me)
    await useAuthStore().initializeAuth()
    expect(localStorage.length).toBe(0)
  })
})
