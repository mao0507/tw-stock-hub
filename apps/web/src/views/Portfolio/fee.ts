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

/** 證券交易稅：一般股票 0.3%、ETF 0.1%（台股 ETF 代號以 00 開頭） */
export const TRANSACTION_TAX_RATE = { stock: 0.003, etf: 0.001 } as const

/** 試算賣出手續費與證交稅；證交稅元以下捨去。 */
export function suggestSellCosts(stockId: string, price: number, shares: number): { fee: number; tax: number } {
  if (!(price > 0) || !(shares > 0)) return { fee: 0, tax: 0 }
  const rate = stockId.startsWith('00') ? TRANSACTION_TAX_RATE.etf : TRANSACTION_TAX_RATE.stock
  return { fee: suggestBuyFee(price, shares), tax: Math.floor(price * shares * rate) }
}
