import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from './auth.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

import { authApi } from '@tw-stock-hub/api-client'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('初始狀態未登入', () => {
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(false)
  })

  it('login 成功後寫入 token 與使用者並登入', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'a1', refresh_token: 'r1',
      user: { id: 'u1', email: 'a@a.com', nickname: 'a' },
    } as never)

    const store = useAuthStore()
    await store.login({ email: 'a@a.com', password: 'x' })

    expect(store.isLoggedIn).toBe(true)
    expect(store.accessToken).toBe('a1')
    expect(localStorage.getItem('tw_stock_access')).toBe('a1')
  })

  it('register 成功後寫入 token 與使用者', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      access_token: 'a2', refresh_token: 'r2',
      user: { id: 'u2', email: 'b@b.com', nickname: 'b' },
    } as never)

    const store = useAuthStore()
    await store.register({ email: 'b@b.com', password: 'x', nickname: 'b' })

    expect(store.user?.email).toBe('b@b.com')
  })

  it('logout 清除 token 即使 API 失敗', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network error'))

    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    await store.logout()

    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.getItem('tw_stock_access')).toBeNull()
  })

  it('fetchMe 失敗時清除 token', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('401'))

    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    await store.fetchMe()

    expect(store.isLoggedIn).toBe(false)
  })

  it('initializeAuth 有 token 沒使用者時呼叫 fetchMe', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', email: 'a@a.com', nickname: 'a' } as never)

    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    await store.initializeAuth()

    expect(authApi.getMe).toHaveBeenCalled()
    expect(store.user?.id).toBe('u1')
  })
})
