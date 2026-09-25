import { setActivePinia, createPinia } from 'pinia'
import axios from 'axios'
import { useAdminStore } from './admin.store'

vi.mock('axios')

describe('useAdminStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('checkServices 標記正常服務為 ok', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: {} })

    const store = useAdminStore()
    await store.checkServices()

    expect(store.services).toEqual([expect.objectContaining({ name: 'API', status: 'ok' })])
    expect(axios.get).toHaveBeenCalledWith('/health', expect.anything())
  })

  it('checkServices 標記失敗服務為 error', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('timeout'))

    const store = useAdminStore()
    await store.checkServices()

    expect(store.services.every((s) => s.status === 'error')).toBe(true)
  })

  it('fetchTodayLogs 成功時設定 logs', async () => {
    // API 回傳分頁物件 { items, total, page, pageSize }
    vi.mocked(axios.get).mockResolvedValue({ data: { items: [{ id: 1, crawlerName: 'TWSEDailyQuoteCrawler' }], total: 1 } })

    const store = useAdminStore()
    await store.fetchTodayLogs()

    expect(store.todayLogs).toHaveLength(1)
    expect(store.isLoading).toBe(false)
    // 以台北時區的「今天」查詢，帶 +08:00 offset（API 只接受含時區的時間）
    const params = vi.mocked(axios.get).mock.calls[0]![1]!.params as { from: string; to: string }
    expect(params.from).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/)
    expect(params.to).toMatch(/T23:59:59\+08:00$/)
  })

  it('fetchTodayLogs 失敗時清空 logs', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('500'))

    const store = useAdminStore()
    await store.fetchTodayLogs()

    expect(store.todayLogs).toEqual([])
  })
})
