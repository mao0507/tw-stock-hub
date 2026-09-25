import { suggestBuyFee } from './fee'

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
