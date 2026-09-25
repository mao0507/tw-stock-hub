/** 金額／股數顯示：千分位，null 顯示「—」 */
export const money = (n: number | null, dp = 0): string =>
  n === null ? '—' : n.toLocaleString('zh-TW', { minimumFractionDigits: dp, maximumFractionDigits: dp })

/** 台股配色：漲紅（text-up）跌綠（text-down） */
export const pnlClass = (n: number | null): string =>
  n === null || n === 0 ? 'text-gray-500' : n > 0 ? 'text-up' : 'text-down'
