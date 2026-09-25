import { suggestBuyFee, suggestSellCosts } from './fee'

describe('suggestBuyFee', () => {
  it.each([
    [100, 1000, 143], // 100000 × 0.1425% = 142.5 → 143
    [10, 1000, 20], // 14.25 → 整股最低 20
    [50, 10, 1], // 0.7125 → 零股最低 1
    [600, 37, 32], // 22200 × 0.1425% = 31.635 → 32
    [0, 1000, 0],
    [100, 0, 0],
  ])('價格 %d、%d 股 → %d 元', (price, shares, fee) => {
    expect(suggestBuyFee(price, shares)).toBe(fee)
  })
})

describe('suggestSellCosts', () => {
  it('一般股票：證交稅 0.3%，元以下捨去', () => {
    // 120 × 1000 = 120000 → 手續費 171，稅 360
    expect(suggestSellCosts('2330', 120, 1000)).toEqual({ fee: 171, tax: 360 })
    // 33.3 × 37 = 1232.1 → 稅 3.6963 → 3
    expect(suggestSellCosts('2330', 33.3, 37).tax).toBe(3)
  })

  it('ETF（00 開頭）：證交稅 0.1%', () => {
    expect(suggestSellCosts('0056', 40, 1000)).toEqual({ fee: 57, tax: 40 })
  })

  it('無效輸入回 0', () => {
    expect(suggestSellCosts('2330', 0, 1000)).toEqual({ fee: 0, tax: 0 })
  })
})
