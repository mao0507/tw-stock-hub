import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

interface ServiceStatus {
  name: string
  status: 'ok' | 'error' | 'unknown'
  latency?: number
}

interface CrawlerLog {
  id: number
  crawlerName: string
  runAt: string
  status: 'success' | 'failed' | 'partial'
  recordsCount: number | null
  errorMessage: string | null
  durationMs: number | null
}

export const useAdminStore = defineStore('admin', () => {
  const services = ref<ServiceStatus[]>([])
  const todayLogs = ref<CrawlerLog[]>([])
  const isLoading = ref(false)

  async function checkServices(): Promise<void> {
    // 後端為單一 api 服務（stock / auth / portfolio / admin 模組），健康檢查同時確認 DB 連線
    const endpoints = [{ name: 'API', url: '/health' }]

    services.value = await Promise.all(
      endpoints.map(async ({ name, url }) => {
        const start = Date.now()
        try {
          await axios.get(url, { timeout: 3000 })
          return { name, status: 'ok' as const, latency: Date.now() - start }
        } catch {
          return { name, status: 'error' as const }
        }
      })
    )
  }

  async function fetchTodayLogs(): Promise<void> {
    isLoading.value = true
    try {
      // 以台北時區的「今天」查詢；API 只接受含時區的時間
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
      const { data } = await axios.get<{ items: CrawlerLog[] }>('/api/admin/crawler-logs', {
        params: { from: `${today}T00:00:00+08:00`, to: `${today}T23:59:59+08:00`, pageSize: 100 },
      })
      todayLogs.value = data.items
    } catch {
      todayLogs.value = []
    } finally {
      isLoading.value = false
    }
  }

  return { services, todayLogs, isLoading, checkServices, fetchTodayLogs }
})
