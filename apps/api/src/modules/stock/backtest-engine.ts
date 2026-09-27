// 回測引擎（#23、#35）：策略在第 i 根收盤產生進出場訊號 → 第 i+1 根開盤成交（避免 look-ahead）。
// 整股全額進出、同時只持有一筆；期末未平倉以最後收盤結算。指標公式與 crawler analytics/technical.py 一致。
import { brokerFee, transactionTax } from '../../lib/fees.js'

export type Bar = { date: string; open: number; high: number; low: number; close: number }
type Series = (number | null)[]
type Signals = { entry: boolean[]; exit: boolean[] }

const round2 = (v: number) => Math.round(v * 100) / 100

function sma(values: number[], period: number): Series {
  let sum = 0
  return values.map((v, i) => {
    sum += v
    if (i >= period) sum -= values[i - period]!
    return i >= period - 1 ? sum / period : null
  })
}

function ema(values: number[], period: number): number[] {
  const a = 2 / (period + 1)
  let prev = values[0] ?? 0
  return values.map((v, i) => (prev = i === 0 ? v : v * a + prev * (1 - a)))
}

function rsi(closes: number[], period: number): Series {
  const out: Series = closes.map(() => null)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    gain += Math.max(closes[i]! - closes[i - 1]!, 0)
    loss += Math.max(closes[i - 1]! - closes[i]!, 0)
  }
  gain /= period
  loss /= period
  const calc = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
  out[period] = calc()
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!
    gain = (gain * (period - 1) + Math.max(diff, 0)) / period
    loss = (loss * (period - 1) + Math.max(-diff, 0)) / period
    out[i] = calc()
  }
  return out
}

function kd(bars: Bar[], n: number): { k: Series; d: Series } {
  const k: Series = bars.map(() => null)
  const d: Series = bars.map(() => null)
  let pk = 50
  let pd = 50
  for (let i = n - 1; i < bars.length; i++) {
    const w = bars.slice(i - n + 1, i + 1)
    const hh = Math.max(...w.map((b) => b.high))
    const ll = Math.min(...w.map((b) => b.low))
    const rsv = hh === ll ? 0 : ((bars[i]!.close - ll) / (hh - ll)) * 100
    pk = (pk * 2 + rsv) / 3
    pd = (pd * 2 + pk) / 3
    k[i] = pk
    d[i] = pd
  }
  return { k, d }
}

const ok = (...v: (number | null | undefined)[]) => v.every((x) => x != null)
/** a 由下往上穿越 b：前一根 a ≤ b、這根 a > b */
const crossUp = (a: Series, b: Series) =>
  a.map((_, i) => i > 0 && ok(a[i], b[i], a[i - 1], b[i - 1]) && a[i]! > b[i]! && a[i - 1]! <= b[i - 1]!)
const crossDown = (a: Series, b: Series) =>
  a.map((_, i) => i > 0 && ok(a[i], b[i], a[i - 1], b[i - 1]) && a[i]! <= b[i]! && a[i - 1]! > b[i - 1]!)
/** 前 n 根（不含當根）的極值 */
const priorExtreme = (v: number[], n: number, pick: (...x: number[]) => number): Series =>
  v.map((_, i) => (i >= n ? pick(...v.slice(i - n, i)) : null))

type ParamSpec = { default: number; min: number; max: number; label: string }
type Strategy = {
  label: string
  params: Record<string, ParamSpec>
  validate?: (p: Record<string, number>) => string | null
  /** 暖身所需的 K 棒數 */
  warmup: (p: Record<string, number>) => number
  signals: (bars: Bar[], p: Record<string, number>) => Signals
}

export const STRATEGIES = {
  ma_cross: {
    label: '均線交叉',
    params: {
      fast: { default: 5, min: 2, max: 120, label: '快線' },
      slow: { default: 20, min: 3, max: 250, label: '慢線' },
    },
    validate: (p) => (p.fast! < p.slow! ? null : '快線天數必須小於慢線天數'),
    warmup: (p) => p.slow!,
    signals: (bars, p) => {
      const c = bars.map((b) => b.close)
      const f = sma(c, p.fast!)
      const s = sma(c, p.slow!)
      return { entry: crossUp(f, s), exit: crossDown(f, s) }
    },
  },
  kd_cross: {
    label: 'KD 交叉',
    params: { period: { default: 9, min: 3, max: 60, label: 'KD 天數' } },
    warmup: (p) => p.period! * 6,
    signals: (bars, p) => {
      const { k, d } = kd(bars, p.period!)
      return { entry: crossUp(k, d), exit: crossDown(k, d) }
    },
  },
  macd_cross: {
    label: 'MACD 交叉',
    params: {
      fast: { default: 12, min: 2, max: 60, label: '快線 EMA' },
      slow: { default: 26, min: 3, max: 120, label: '慢線 EMA' },
      signal: { default: 9, min: 2, max: 60, label: '訊號線' },
    },
    validate: (p) => (p.fast! < p.slow! ? null : '快線天數必須小於慢線天數'),
    warmup: (p) => p.slow! * 4,
    signals: (bars, p) => {
      const c = bars.map((b) => b.close)
      const fast = ema(c, p.fast!)
      const slow = ema(c, p.slow!)
      const dif = fast.map((v, i) => v - slow[i]!)
      const dea = ema(dif, p.signal!)
      return { entry: crossUp(dif, dea), exit: crossDown(dif, dea) }
    },
  },
  breakout: {
    label: '突破 N 日高',
    params: {
      entryDays: { default: 20, min: 3, max: 250, label: '突破天數' },
      exitDays: { default: 10, min: 2, max: 250, label: '跌破天數' },
    },
    warmup: (p) => Math.max(p.entryDays!, p.exitDays!),
    signals: (bars, p) => {
      const hi = priorExtreme(bars.map((b) => b.high), p.entryDays!, Math.max)
      const lo = priorExtreme(bars.map((b) => b.low), p.exitDays!, Math.min)
      return {
        entry: bars.map((b, i) => hi[i] != null && b.close > hi[i]!),
        exit: bars.map((b, i) => lo[i] != null && b.close < lo[i]!),
      }
    },
  },
  rsi_rebound: {
    label: 'RSI 超賣反彈',
    params: {
      period: { default: 14, min: 2, max: 60, label: 'RSI 天數' },
      buyBelow: { default: 30, min: 5, max: 50, label: '超賣線' },
      sellAbove: { default: 70, min: 50, max: 95, label: '出場線' },
    },
    warmup: (p) => p.period! * 6,
    signals: (bars, p) => {
      const r = rsi(bars.map((b) => b.close), p.period!)
      return {
        // RSI 由超賣線下方回升穿越 → 進場；到達出場線 → 出場
        entry: r.map((v, i) => i > 0 && ok(v, r[i - 1]) && r[i - 1]! < p.buyBelow! && v! >= p.buyBelow!),
        exit: r.map((v) => v != null && v >= p.sellAbove!),
      }
    },
  },
} satisfies Record<string, Strategy>

export type StrategyKey = keyof typeof STRATEGIES
export const STRATEGY_KEYS = Object.keys(STRATEGIES) as [StrategyKey, ...StrategyKey[]]

/** 依策略補預設值並檢查範圍；錯誤回字串 */
export function resolveParams(key: StrategyKey, input: Record<string, number | undefined>): Record<string, number> | string {
  const s: Strategy = STRATEGIES[key]
  const p: Record<string, number> = {}
  for (const [name, spec] of Object.entries(s.params)) {
    const v = input[name] ?? spec.default
    if (!Number.isInteger(v) || v < spec.min || v > spec.max) return `${spec.label}須為 ${spec.min}–${spec.max} 的整數`
    p[name] = v
  }
  return s.validate?.(p) ?? p
}

export const warmupBars = (key: StrategyKey, p: Record<string, number>) => (STRATEGIES[key] as Strategy).warmup(p)

export type Trade = {
  entryDate: string; entryPrice: number; exitDate: string; exitPrice: number
  shares: number; fees: number; returnPct: number
}

export function runBacktest(opts: {
  stockId: string; bars: Bar[]; strategy: StrategyKey; params: Record<string, number>
  capital: number; fees: boolean; from?: string
}) {
  const { bars, capital, from } = opts
  const { entry, exit } = (STRATEGIES[opts.strategy] as Strategy).signals(bars, opts.params)
  const buyFee = (price: number, n: number) => (opts.fees ? brokerFee(price, n) : 0)
  const sellCost = (price: number, n: number) => (opts.fees ? brokerFee(price, n) + transactionTax(opts.stockId, price, n) : 0)

  let cash = capital
  let shares = 0
  let pos: { date: string; price: number; cost: number; fee: number } | null = null
  const trades: Trade[] = []
  let totalFees = 0
  let peak = capital
  let maxDd = 0

  const sell = (date: string, price: number) => {
    const cost = sellCost(price, shares)
    const proceeds = shares * price - cost
    cash += proceeds
    totalFees += cost
    trades.push({
      entryDate: pos!.date, entryPrice: pos!.price, exitDate: date, exitPrice: price, shares,
      fees: pos!.fee + cost,
      returnPct: round2((proceeds / (pos!.cost + pos!.fee) - 1) * 100),
    })
    shares = 0
    pos = null
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!
    const prev = i - 1
    // 前一根收盤出現訊號 → 這根開盤成交；只在 from 之後下單
    if (prev >= 0 && (!from || bars[prev]!.date >= from)) {
      if (!pos && entry[prev]) {
        // 能負擔「成交金額 + 手續費」的最大整股數
        let n = Math.floor(cash / (bar.open * (opts.fees ? 1.001425 : 1)))
        while (n > 0 && n * bar.open + buyFee(bar.open, n) > cash) n--
        if (n > 0) {
          const fee = buyFee(bar.open, n)
          shares = n
          cash -= n * bar.open + fee
          totalFees += fee
          pos = { date: bar.date, price: bar.open, cost: n * bar.open, fee }
        }
      } else if (pos && exit[prev]) {
        sell(bar.date, bar.open)
      }
    }
    const equity = cash + shares * bar.close
    peak = Math.max(peak, equity)
    maxDd = Math.min(maxDd, equity / peak - 1)
  }
  const last = bars.at(-1)
  if (pos && last) sell(last.date, last.close)

  const wins = trades.filter((t) => t.returnPct > 0).length
  return {
    trades,
    tradeCount: trades.length,
    winRate: trades.length ? round2((wins / trades.length) * 100) : 0,
    totalReturnPct: round2((cash / capital - 1) * 100),
    maxDrawdownPct: round2(maxDd * 100),
    finalCapital: round2(cash),
    totalFees: round2(totalFees),
  }
}
