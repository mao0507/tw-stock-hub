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

    expect(store.services).toHaveLength(2)
    expect(store.services.every((s) => s.status === 'ok')).toBe(true)
  })

  it('checkServices 標記失敗服務為 error', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('timeout'))

    const store = useAdminStore()
    await store.checkServices()

    expect(store.services.every((s) => s.status === 'error')).toBe(true)
  })

  it('fetchTodayLogs 成功時設定 logs', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [{ id: 1, crawlerName: 'twse_daily' }] })

    const store = useAdminStore()
    await store.fetchTodayLogs()

    expect(store.todayLogs).toHaveLength(1)
    expect(store.isLoading).toBe(false)
  })

  it('fetchTodayLogs 失敗時清空 logs', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('500'))

    const store = useAdminStore()
    await store.fetchTodayLogs()

    expect(store.todayLogs).toEqual([])
  })
})
