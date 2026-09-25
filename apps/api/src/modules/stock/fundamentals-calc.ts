// 基本面純計算（無 I/O）：比率、填息、進階財務指標、股利發放率

export const round2 = (v: number) => Math.round(v * 100) / 100

/** part ÷ whole（%），任一缺值或分母為 0 回 null */
export function pct(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole === 0) return null
  return Math.round((part / whole) * 10000) / 100
}

export type Close = { date: string; close: number }
export type Fill = { refPrice: number; filled: boolean; fillDays: number | null; gapPct: number | null }

/**
 * 填息：除息日前一個交易日收盤為參考價，除息後收盤漲回參考價即填息。
 * 未填息時 gapPct 為最新收盤距參考價的百分比。除息日前沒有行情則無法判斷（null）。
 */
export function calcFill(closes: readonly Close[], exDate: string): Fill | null {
  const exIdx = closes.findIndex((c) => c.date >= exDate)
  if (exIdx <= 0) return null
  const refPrice = round2(closes[exIdx - 1]!.close)
  for (let i = exIdx; i < closes.length; i++) {
    if (closes[i]!.close >= refPrice) return { refPrice, filled: true, fillDays: i - exIdx + 1, gapPct: null }
  }
  const last = closes.at(-1)!.close
  return { refPrice, filled: false, fillDays: null, gapPct: round2(((last - refPrice) / refPrice) * 100) }
}

export type FinRow = {
  year: number
  quarter: number
  revenue: number | null
  netIncome: number | null
  pretaxIncome: number | null
  eps: number | null
  costOfGoodsSold: number | null
  opExpenses: number | null
  nonOpIncome: number | null
}

export type BsRow = {
  year: number
  quarter: number
  totalAssets: number | null
  totalEquity: number | null
  accountsReceivable: number | null
  inventories: number | null
  contractLiabilities: number | null
}

type BsKey = 'totalAssets' | 'totalEquity' | 'accountsReceivable' | 'inventories'
const periodOf = (r: { year: number; quarter: number }) => `${r.year}Q${r.quarter}`
/** 真正的前一季（Q1 的前一季是去年 Q4），不是資料列的前一筆 */
const prevPeriod = ({ year, quarter }: { year: number; quarter: number }) =>
  quarter === 1 ? `${year - 1}Q4` : `${year}Q${quarter - 1}`
const quarterIndex = (r: { year: number; quarter: number }) => r.year * 4 + r.quarter

/** 近四季 EPS 合計（TTM）；最近四筆有 EPS 的季度必須連續，否則回 null */
export function ttmEps(fin: readonly FinRow[]): number | null {
  const last = fin.filter((f) => f.eps != null).slice(-4)
  if (last.length < 4) return null
  const consecutive = last.every((f, i) => i === 0 || quarterIndex(f) === quarterIndex(last[i - 1]!) + 1)
  return consecutive ? last.reduce((s, f) => s + f.eps!, 0) : null
}

/**
 * 進階季度指標（最近 20 季）。存量科目取「前一季（依季別推算）與本季平均」，前一季無資料則用本季；
 * 損益為單季，ROE/ROA/週轉率以 ×4 年化；週轉天數以一季 90 天計。
 */
export function quarterlyMetrics(fin: readonly FinRow[], bs: readonly BsRow[]) {
  const bsByPeriod = new Map(bs.map((b) => [periodOf(b), b]))
  const avg = (f: FinRow, key: BsKey): number | null => {
    const cur = bsByPeriod.get(periodOf(f))?.[key] ?? null
    if (cur == null) return null
    const prev = bsByPeriod.get(prevPeriod(f))?.[key] ?? null
    return prev != null ? (cur + prev) / 2 : cur
  }

  return fin.slice(-20).map((f) => {
    const bsNow = bsByPeriod.get(periodOf(f))
    const avgAssets = avg(f, 'totalAssets')
    const avgEquity = avg(f, 'totalEquity')
    const avgInv = avg(f, 'inventories')
    const avgAr = avg(f, 'accountsReceivable')
    const { revenue, netIncome, costOfGoodsSold: cogs } = f
    return {
      period: periodOf(f),
      opExpenseRatio: pct(f.opExpenses, revenue),
      nonOpToPretaxPct: pct(f.nonOpIncome, f.pretaxIncome),
      netMargin: pct(netIncome, revenue),
      roe: netIncome != null && avgEquity ? round2(((netIncome * 4) / avgEquity) * 100) : null,
      roa: netIncome != null && avgAssets ? round2(((netIncome * 4) / avgAssets) * 100) : null,
      assetTurnover: revenue != null && avgAssets ? round2((revenue * 4) / avgAssets) : null,
      equityMultiplier: avgAssets != null && avgEquity ? round2(avgAssets / avgEquity) : null,
      inventoryDays: avgInv != null && cogs ? Math.round((avgInv * 90) / cogs) : null,
      receivableDays: avgAr != null && revenue ? Math.round((avgAr * 90) / revenue) : null,
      contractLiabToRevenuePct:
        bsNow?.contractLiabilities != null && revenue ? round2((bsNow.contractLiabilities / (revenue * 4)) * 100) : null,
    }
  })
}

export type DividendRow = { dividendYear: string; cash: number; exDate: string | null }

/**
 * 近 12 個月現金股利（除息日落在 refDate 往前一年內）。適合季配、月配；
 * 沒有任何除息日資料時回 null，由呼叫端改用年度合計。
 */
export function trailingCash(divs: readonly DividendRow[], refDate: string): number | null {
  const dated = divs.filter((d) => d.exDate)
  if (!dated.length) return null
  const from = new Date(`${refDate}T00:00:00Z`)
  from.setUTCFullYear(from.getUTCFullYear() - 1)
  const start = from.toISOString().slice(0, 10)
  const sum = dated.filter((d) => d.exDate! > start && d.exDate! <= refDate).reduce((s, d) => s + d.cash, 0)
  return sum > 0 ? sum : null
}

/**
 * 年度現金股利發放率（最近 10 個有配息年度）：股利年度為民國年，對應西元年四季 EPS 合計；
 * EPS 不足四季時不計算。
 */
export function payoutRatios(divs: readonly DividendRow[], fin: readonly FinRow[]) {
  const cashByRoc = new Map<number, number>()
  for (const d of divs) {
    const roc = Number(d.dividendYear)
    if (Number.isFinite(roc)) cashByRoc.set(roc, (cashByRoc.get(roc) ?? 0) + d.cash)
  }
  const epsByYear = new Map<number, { eps: number; quarters: number }>()
  for (const f of fin) {
    if (f.eps == null) continue
    const cur = epsByYear.get(f.year) ?? { eps: 0, quarters: 0 }
    epsByYear.set(f.year, { eps: cur.eps + f.eps, quarters: cur.quarters + 1 })
  }
  return [...cashByRoc.entries()]
    .filter(([, cash]) => cash > 0)
    .map(([roc, cash]) => {
      const y = epsByYear.get(roc + 1911)
      const eps = y && y.quarters === 4 ? round2(y.eps) : null
      return {
        year: String(roc),
        cashDividend: round2(cash),
        eps,
        payoutPct: eps != null && eps > 0 ? round2((cash / eps) * 100) : null,
      }
    })
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 10)
}

/** 最近「有現金股利」年度的合計（同年多期相加，跳過配 0 的年度） */
export function latestAnnualCash(divs: readonly DividendRow[]): number | null {
  const byYear = new Map<string, number>()
  for (const d of divs) byYear.set(d.dividendYear, (byYear.get(d.dividendYear) ?? 0) + d.cash)
  const years = [...byYear.entries()].filter(([, c]) => c > 0).sort((a, b) => Number(b[0]) - Number(a[0]))
  return years[0]?.[1] ?? null
}
