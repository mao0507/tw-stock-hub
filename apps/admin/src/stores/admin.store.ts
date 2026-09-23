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
    const endpoints = [
      { name: 'Stock API', url: '/health/stock' },
      { name: 'Auth Service', url: '/health/auth' },
    ]

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
      const today = new Date().toISOString().split('T')[0]
      const { data } = await axios.get<{ items: CrawlerLog[] }>('/api/admin/crawler-logs', {
        params: { from: `${today}T00:00:00`, to: `${today}T23:59:59`, pageSize: 100 },
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
