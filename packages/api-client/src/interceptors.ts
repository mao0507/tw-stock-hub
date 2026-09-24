import type { AxiosInstance } from 'axios'
import axios from 'axios'

/** 這些路徑的 401 屬正常流程（例如訪客查詢登入狀態），不觸發導向登入 */
const SILENT_401_PATHS = ['/api/auth/me', '/api/auth/logout']

/** 任何 API 回 401（登入失效）時呼叫 onUnauthorized。 */
export function setupUnauthorizedHandler(instance: AxiosInstance, onUnauthorized: () => void): void {
  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        !SILENT_401_PATHS.some((p) => error.config?.url?.startsWith(p))
      ) {
        onUnauthorized()
      }
      return Promise.reject(error)
    },
  )
}
