import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StockQuickActions from './StockQuickActions.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useWatchlistStore } from '@/stores/watchlist.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  authApi: { getMe: vi.fn(), logout: vi.fn(), loginUrl: (r?: string) => `/api/auth/google?redirect=${r ?? ''}` },
  watchlistApi: {
    getWatchlist: vi.fn().mockResolvedValue({ groups: [], items: [] }),
    addToWatchlist: vi.fn().mockResolvedValue(undefined),
    removeFromWatchlist: vi.fn().mockResolvedValue(undefined),
  },
  portfolioApi: {
    getHoldings: vi.fn().mockResolvedValue({ items: [], closed: [], totals: null }),
    createLot: vi.fn().mockResolvedValue({}),
  },
}))

import { watchlistApi } from '@tw-stock-hub/api-client'

const me = { id: 'u1', email: 'a@a.com', nickname: 'a', avatarUrl: null }
const item = (stockId: string) => ({
  id: 'w1', stockId, name: stockId, groupId: null, note: null, sortOrder: 0,
  addedAt: '', close: null, change: null, changePct: null, priceDate: null,
})

const mounted: { unmount: () => void }[] = []

function mountWith({ loggedIn = true } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (loggedIn) useAuthStore().user = me
  const w = mount(StockQuickActions, {
    props: { stockId: '2330', latestClose: 1010 },
    global: { plugins: [pinia], stubs: { RouterLink: true } },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

describe('StockQuickActions', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    document.body.innerHTML = ''
  })

  it('未登入時提示登入，不顯示操作按鈕', () => {
    const w = mountWith({ loggedIn: false })
    expect(w.text()).toContain('登入')
    expect(w.find('[data-test="buy"]').exists()).toBe(false)
    expect(w.find('[data-test="watch"]').exists()).toBe(false)
  })

  it('已在自選時顯示已追蹤狀態', async () => {
    const w = mountWith()
    useWatchlistStore().watchlist = [item('2330')]
    await flushPromises()
    expect(w.text()).toContain('已追蹤')
  })

  it('沒有分組時，加入自選直接加入並顯示成功訊息', async () => {
    const w = mountWith()
    await flushPromises()
    await w.get('[data-test="watch"]').trigger('click')
    await flushPromises()
    expect(watchlistApi.addToWatchlist).toHaveBeenCalledWith({ stockId: '2330' })
    expect(w.get('[role="status"]').text()).toContain('已加入自選')
  })

  it('加入時回 409（其他分頁已加入）：重新載入後按鈕顯示已追蹤', async () => {
    const w = mountWith()
    await flushPromises()
    vi.mocked(watchlistApi.addToWatchlist).mockRejectedValueOnce({ response: { status: 409 } })
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValueOnce({ groups: [], items: [item('2330')] })
    await w.get('[data-test="watch"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('已追蹤')
  })

  it('有分組時，先選分組再加入', async () => {
    const w = mountWith()
    useWatchlistStore().groups = [{ id: 'g1', name: '高股息', color: null, sortOrder: 0 }]
    await flushPromises()
    await w.get('[data-test="watch"]').trigger('click')
    await flushPromises()
    const select = document.body.querySelector('[data-test="group-select"]') as HTMLSelectElement
    expect(select).not.toBeNull()
    select.value = 'g1'
    select.dispatchEvent(new Event('change'))
    ;(document.body.querySelector('[data-test="confirm-watch"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(watchlistApi.addToWatchlist).toHaveBeenCalledWith({ stockId: '2330', groupId: 'g1' })
  })
})
