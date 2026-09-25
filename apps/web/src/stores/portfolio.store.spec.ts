import { setActivePinia, createPinia } from 'pinia'
import { usePortfolioStore } from './portfolio.store'

vi.mock('@tw-stock-hub/api-client', () => ({
  portfolioApi: {
    getHoldings: vi.fn(),
    listLots: vi.fn(),
    createLot: vi.fn(),
    updateLot: vi.fn(),
    deleteLot: vi.fn(),
  },
}))

import { portfolioApi } from '@tw-stock-hub/api-client'

const summary = (shares: number) => ({
  items: [{ stockId: '2330', shares }],
  totals: { costBasis: 0, marketValue: 0, unrealizedPnl: 0, returnPct: null, staleCount: 0 },
})

describe('usePortfolioStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchHoldings 載入持股與總計', async () => {
    vi.mocked(portfolioApi.getHoldings).mockResolvedValue(summary(1000) as never)
    const store = usePortfolioStore()
    await store.fetchHoldings()
    expect(store.holdings).toHaveLength(1)
    expect(store.totals?.staleCount).toBe(0)
    expect(store.isLoading).toBe(false)
  })

  it('fetchHoldings 失敗時記錄錯誤訊息', async () => {
    vi.mocked(portfolioApi.getHoldings).mockRejectedValue(new Error('boom'))
    const store = usePortfolioStore()
    await store.fetchHoldings()
    expect(store.error).toBeTruthy()
    expect(store.isLoading).toBe(false)
  })

  it.each([
    ['addLot', () => usePortfolioStore().addLot({ stockId: '2330', boughtAt: '2026-01-02', price: 1, shares: 1, fee: 0 })],
    ['updateLot', () => usePortfolioStore().updateLot('l1', { shares: 2 })],
    ['removeLot', () => usePortfolioStore().removeLot('l1')],
  ])('%s 成功後重新載入持股（由後端重算）', async (_name, run) => {
    vi.mocked(portfolioApi.getHoldings).mockResolvedValue(summary(2000) as never)
    await run()
    expect(portfolioApi.getHoldings).toHaveBeenCalledTimes(1)
    expect(usePortfolioStore().holdings[0]?.shares).toBe(2000)
  })

  it('addLot 失敗時拋出錯誤且不重新載入', async () => {
    vi.mocked(portfolioApi.createLot).mockRejectedValue(new Error('400'))
    await expect(
      usePortfolioStore().addLot({ stockId: '0000', boughtAt: '2026-01-02', price: 1, shares: 1, fee: 0 }),
    ).rejects.toThrow()
    expect(portfolioApi.getHoldings).not.toHaveBeenCalled()
  })
})
