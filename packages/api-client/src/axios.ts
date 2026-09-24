import axios from 'axios'

// 同源：Nginx（正式）/ Vite proxy（開發）把 /api 轉給 api 單體。
// 登入狀態在 httpOnly cookie，瀏覽器自動帶上，不需手動處理 token。
export const apiClient = axios.create({
  baseURL: '',
  timeout: 10_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})
