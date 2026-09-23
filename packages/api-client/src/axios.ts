import axios from 'axios'

// 同源：Nginx（正式）/ Vite proxy（開發）把 /api 轉給 api 單體
const STOCK_API_URL = ''
const AUTH_API_URL = ''

export const stockApiClient = axios.create({
  baseURL: STOCK_API_URL,
  timeout: 10_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

export const authApiClient = axios.create({
  baseURL: AUTH_API_URL,
  timeout: 10_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})
