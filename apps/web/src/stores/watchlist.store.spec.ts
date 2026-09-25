import { setActivePinia, createPinia } from 'pinia'
import { useWatchlistStore } from './watchlist.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  watchlistApi: {
    getWatchlist: vi.fn(),
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
    updateItem: vi.fn(),
    reorderItems: vi.fn(),
    reorderGroups: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
  },
}))

import { watchlistApi } from '@tw-stock-hub/api-client'

const item = (stockId: string, groupId: string | null, sortOrder: number) => ({
  id: `w-${stockId}`, stockId, name: stockId, groupId, note: null, sortOrder,
  addedAt: '2026-01-01', close: null, change: null, changePct: null, priceDate: null,
})
const group = (id: string, sortOrder: number) => ({ id, name: id, color: null, sortOrder })

function seed(store: ReturnType<typeof useWatchlistStore>) {
  store.groups = [group('g1', 0), group('g2', 1)]
  store.watchlist = [item('2330', 'g1', 0), item('0056', 'g1', 1), item('2317', null, 0)]
}

describe('useWatchlistStore（分組）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ groups: [], items: [] })
  })

  it('fetchWatchlist 載入分組與自選股', async () => {
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ groups: [group('g1', 0)], items: [item('2330', 'g1', 0)] })
    const store = useWatchlistStore()
    await store.fetchWatchlist()
    expect(store.groups).toHaveLength(1)
    expect(store.watchlist).toHaveLength(1)
    expect(store.isLoading).toBe(false)
  })

  it('fetchWatchlist 失敗時不丟錯，清單維持空', async () => {
    vi.mocked(watchlistApi.getWatchlist).mockRejectedValue(new Error('boom'))
    const store = useWatchlistStore()
    await store.fetchWatchlist()
    expect(store.watchlist).toEqual([])
  })

  it('sections：依分組順序分段，未分組放最後', () => {
    const store = useWatchlistStore()
    seed(store)
    expect(store.sections.map((s) => [s.group?.id ?? null, s.items.map((i) => i.stockId)])).toEqual([
      ['g1', ['2330', '0056']],
      ['g2', []],
      [null, ['2317']],
    ])
  })

  it('isWatched 判斷是否已在自選', () => {
    const store = useWatchlistStore()
    seed(store)
    expect(store.isWatched('2330')).toBe(true)
    expect(store.isWatched('9999')).toBe(false)
  })

  it('add 失敗時往外拋', async () => {
    vi.mocked(watchlistApi.addToWatchlist).mockRejectedValue(new Error('conflict'))
    await expect(useWatchlistStore().add('2317')).rejects.toThrow('conflict')
  })

  it('moveItem 往上：整組新順序一次送出', async () => {
    const store = useWatchlistStore()
    seed(store)
    await store.moveItem('0056', -1)
    expect(watchlistApi.reorderItems).toHaveBeenCalledWith('g1', ['0056', '2330'])
  })

  it('moveItem 已在最前面時不呼叫 API', async () => {
    const store = useWatchlistStore()
    seed(store)
    await store.moveItem('2330', -1)
    expect(watchlistApi.reorderItems).not.toHaveBeenCalled()
  })

  it('moveItem 在 sortOrder 相同時仍依畫面順序交換', async () => {
    const store = useWatchlistStore()
    store.watchlist = [item('A', null, 1), item('B', null, 1), item('C', null, 2)]
    await store.moveItem('B', -1)
    expect(watchlistApi.reorderItems).toHaveBeenCalledWith(null, ['B', 'A', 'C'])
  })

  it('moveGroup 往下：所有分組新順序一次送出', async () => {
    const store = useWatchlistStore()
    seed(store)
    await store.moveGroup('g1', 1)
    expect(watchlistApi.reorderGroups).toHaveBeenCalledWith(['g2', 'g1'])
  })

  it('異動後重新載入（伺服器為準）', async () => {
    const store = useWatchlistStore()
    await store.moveToGroup('2330', 'g2')
    expect(watchlistApi.updateItem).toHaveBeenCalledWith('2330', { groupId: 'g2' })
    expect(watchlistApi.getWatchlist).toHaveBeenCalledTimes(1)
  })
})
