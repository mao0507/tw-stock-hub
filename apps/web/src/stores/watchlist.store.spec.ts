import { setActivePinia, createPinia } from 'pinia'
import { useWatchlistStore } from './watchlist.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  watchlistApi: {
    getWatchlist: vi.fn(),
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
    updateWatchlistNote: vi.fn(),
  },
}))

import { watchlistApi } from '@tw-stock-hub/api-client'

describe('useWatchlistStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchWatchlist 載入清單', async () => {
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue([
      { id: 'w1', stockId: '2330', note: null, addedAt: '2024-01-01' },
    ] as never)

    const store = useWatchlistStore()
    await store.fetchWatchlist()

    expect(store.watchlist).toHaveLength(1)
    expect(store.isLoading).toBe(false)
  })

  it('fetchWatchlist 失敗時不丟錯，清單維持空', async () => {
    vi.mocked(watchlistApi.getWatchlist).mockRejectedValue(new Error('boom'))

    const store = useWatchlistStore()
    await store.fetchWatchlist()

    expect(store.watchlist).toEqual([])
  })

  it('add 將新項目插入清單最前面', async () => {
    vi.mocked(watchlistApi.addToWatchlist).mockResolvedValue(
      { id: 'w2', stockId: '2317', note: null, addedAt: '2024-01-02' } as never,
    )

    const store = useWatchlistStore()
    await store.add('2317')

    expect(store.watchlist[0]!.stockId).toBe('2317')
  })

  it('add 失敗時往外拋並不修改清單', async () => {
    vi.mocked(watchlistApi.addToWatchlist).mockRejectedValue(new Error('conflict'))

    const store = useWatchlistStore()
    await expect(store.add('2317')).rejects.toThrow('conflict')
    expect(store.watchlist).toEqual([])
  })

  it('remove 從清單移除指定股票', async () => {
    vi.mocked(watchlistApi.removeFromWatchlist).mockResolvedValue(undefined as never)

    const store = useWatchlistStore()
    store.watchlist.push({ id: 'w1', stockId: '2330', note: null, addedAt: '2024-01-01' } as never)
    await store.remove('2330')

    expect(store.watchlist).toEqual([])
  })

  it('updateNote 更新指定項目的備註', async () => {
    vi.mocked(watchlistApi.updateWatchlistNote).mockResolvedValue(
      { id: 'w1', stockId: '2330', note: '新筆記', addedAt: '2024-01-01' } as never,
    )

    const store = useWatchlistStore()
    store.watchlist.push({ id: 'w1', stockId: '2330', note: null, addedAt: '2024-01-01' } as never)
    await store.updateNote('2330', '新筆記')

    expect(store.watchlist[0]!.note).toBe('新筆記')
  })
})
