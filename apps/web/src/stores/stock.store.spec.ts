import { setActivePinia, createPinia } from 'pinia'
import { useStockStore } from './stock.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  stockApi: {
    getStockDetail: vi.fn(),
    getStockQuote: vi.fn(),
    getStockInstitutional: vi.fn(),
    getStockMargin: vi.fn(),
  },
}))

import { stockApi } from '@tw-stock-hub/api-client'

describe('useStockStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchStock 成功時設定 currentStock', async () => {
    vi.mocked(stockApi.getStockDetail).mockResolvedValue({ id: '2330', name: '台積電' } as never)

    const store = useStockStore()
    await store.fetchStock('2330')

    expect(store.currentStock).toEqual({ id: '2330', name: '台積電' })
    expect(store.error).toBeNull()
  })

  it('fetchStock 404 時設定找不到訊息', async () => {
    vi.mocked(stockApi.getStockDetail).mockRejectedValue({ response: { status: 404 } })

    const store = useStockStore()
    await store.fetchStock('9999')

    expect(store.error).toBe('找不到股票代號 9999')
  })

  it('fetchStock 其他錯誤時設定一般錯誤訊息', async () => {
    vi.mocked(stockApi.getStockDetail).mockRejectedValue(new Error('network'))

    const store = useStockStore()
    await store.fetchStock('2330')

    expect(store.error).toBe('載入股票資料失敗')
  })

  it('reset 清空所有資料', async () => {
    vi.mocked(stockApi.getStockDetail).mockResolvedValue({ id: '2330' } as never)
    const store = useStockStore()
    await store.fetchStock('2330')

    store.reset()

    expect(store.currentStock).toBeNull()
    expect(store.quoteData).toEqual([])
    expect(store.error).toBeNull()
  })

  it('fetchQuote 帶入預設 limit', async () => {
    vi.mocked(stockApi.getStockQuote).mockResolvedValue([{ date: '2024-01-01' }] as never)

    const store = useStockStore()
    await store.fetchQuote('2330')

    expect(stockApi.getStockQuote).toHaveBeenCalledWith('2330', { limit: 60 })
    expect(store.quoteData).toHaveLength(1)
  })
})
