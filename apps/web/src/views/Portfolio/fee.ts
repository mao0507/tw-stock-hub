/** 券商牌告手續費率 0.1425% */
export const BROKER_FEE_RATE = 0.001425

/**
 * 試算買入手續費：成交金額 × 0.1425%，四捨五入到元。
 * 最低收費：整股 20 元、零股 1 元（多數券商規則；實際折扣以使用者輸入為準）。
 */
export function suggestBuyFee(price: number, shares: number): number {
  if (!(price > 0) || !(shares > 0)) return 0
  const fee = Math.round(price * shares * BROKER_FEE_RATE)
  return Math.max(fee, shares >= 1000 ? 20 : 1)
}
