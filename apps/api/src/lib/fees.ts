// 台股交易成本。規則需與 apps/web/src/views/Portfolio/fee.ts（持股頁試算）一致。

/** 券商牌告手續費率 0.1425% */
export const BROKER_FEE_RATE = 0.001425

/** 證券交易稅：一般股票 0.3%、ETF 0.1%（台股 ETF 代號以 00 開頭） */
export const TRANSACTION_TAX_RATE = { stock: 0.003, etf: 0.001 } as const

/** 手續費：成交金額 × 0.1425% 四捨五入到元；最低整股 20 元、零股 1 元 */
export function brokerFee(price: number, shares: number): number {
  if (!(price > 0) || !(shares > 0)) return 0
  return Math.max(Math.round(price * shares * BROKER_FEE_RATE), shares >= 1000 ? 20 : 1)
}

/** 證交稅：元以下捨去 */
export function transactionTax(stockId: string, price: number, shares: number): number {
  if (!(price > 0) || !(shares > 0)) return 0
  const rate = stockId.startsWith('00') ? TRANSACTION_TAX_RATE.etf : TRANSACTION_TAX_RATE.stock
  return Math.floor(price * shares * rate)
}
