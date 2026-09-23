import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'

interface TokenStore {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  setTokens: (access: string, refresh: string) => void
  clearTokens: () => void
  redirectToLogin: () => void
}

let tokenStore: TokenStore | null = null

export function setupTokenStore(store: TokenStore): void {
  tokenStore = store
}

let isRefreshing = false
let pendingQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(token: string | null, error: unknown = null): void {
  for (const { resolve, reject } of pendingQueue) {
    if (token) resolve(token)
    else reject(error)
  }
  pendingQueue = []
}

export function setupInterceptors(instance: AxiosInstance, isAuthInstance = false): void {
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = tokenStore?.getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!axios.isAxiosError(error)) return Promise.reject(error)

      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

      if (
        error.response?.status !== 401 ||
        originalRequest._retry ||
        isAuthInstance
      ) {
        return Promise.reject(error)
      }

      originalRequest._retry = true

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(instance(originalRequest))
            },
            reject,
          })
        })
      }

      isRefreshing = true

      try {
        const refreshToken = tokenStore?.getRefreshToken()
        if (!refreshToken) throw new Error('No refresh token')

        const authBase = instance.defaults.baseURL?.replace(':3002', ':3001') ?? 'http://localhost:3001'
        const { data } = await axios.post<{
          access_token: string
          refresh_token: string
        }>(`${authBase}/api/auth/refresh`, { refresh_token: refreshToken })

        const { access_token, refresh_token } = data
        tokenStore?.setTokens(access_token, refresh_token)
        processQueue(access_token)

        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return instance(originalRequest)
      } catch (refreshError) {
        processQueue(null, refreshError)
        tokenStore?.clearTokens()
        tokenStore?.redirectToLogin()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    },
  )
}
