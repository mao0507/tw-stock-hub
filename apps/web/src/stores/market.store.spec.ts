import { setActivePinia, createPinia } from 'pinia'
import { useMarketStore } from './market.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  stockApi: {
    getMarketOverview: vi.fn(),
    getMarketHeatmap: vi.fn(),
    getMarketHistory: vi.fn(),
  },
}))

import { stockApi } from '@tw-stock-hub/api-client'

describe('useMarketStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchOverview 成功設定 overview', async () => {
    vi.mocked(stockApi.getMarketOverview).mockResolvedValue({ taiexClose: 18000 } as never)

    const store = useMarketStore()
    await store.fetchOverview()

    expect(store.overview).toEqual({ taiexClose: 18000 })
  })

  it('fetchOverview 失敗設定錯誤訊息', async () => {
    vi.mocked(stockApi.getMarketOverview).mockRejectedValue(new Error('boom'))

    const store = useMarketStore()
    await store.fetchOverview()

    expect(store.error).toBe('無法載入大盤資料')
  })

  it('fetchHeatmap 取出 sectors', async () => {
    vi.mocked(stockApi.getMarketHeatmap).mockResolvedValue({ date: '2024-01-01', sectors: [{ sectorName: '半導體' }] } as never)

    const store = useMarketStore()
    await store.fetchHeatmap()

    expect(store.heatmapData).toEqual([{ sectorName: '半導體' }])
  })

  it.each([
    ['1M', 30], ['3M', 90], ['6M', 180], ['1Y', 365],
  ] as const)('fetchHistory(%s) 對應 limit=%i', async (period, limit) => {
    vi.mocked(stockApi.getMarketHistory).mockResolvedValue([] as never)

    const store = useMarketStore()
    await store.fetchHistory(period)

    expect(stockApi.getMarketHistory).toHaveBeenCalledWith({ interval: 'daily', limit })
  })
})
