// 技術指標計算（KD / MACD / RSI），輸入為時間序列的 OHLC。

export interface OHLC {
  date: string
  high: number
  low: number
  close: number
}

export interface Point {
  time: string
  value: number
}

/** RSI（預設 14 日，Wilder 平滑） */
export function calcRSI(data: OHLC[], period = 14): Point[] {
  const out: Point[] = []
  if (data.length <= period) return out
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = data[i]!.close - data[i - 1]!.close
    if (diff >= 0) avgGain += diff
    else avgLoss -= diff
  }
  avgGain /= period
  avgLoss /= period
  const rsi = (g: number, l: number): number => (l === 0 ? 100 : 100 - 100 / (1 + g / l))
  out.push({ time: data[period]!.date, value: round(rsi(avgGain, avgLoss)) })
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i]!.close - data[i - 1]!.close
    const gain = diff >= 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out.push({ time: data[i]!.date, value: round(rsi(avgGain, avgLoss)) })
  }
  return out
}

/** KD 隨機指標（RSV n=9，K/D 平滑=3） */
export function calcKD(data: OHLC[], n = 9, kSmooth = 3, dSmooth = 3): { k: Point[]; d: Point[] } {
  const k: Point[] = []
  const d: Point[] = []
  if (data.length < n) return { k, d }
  let prevK = 50
  let prevD = 50
  for (let i = n - 1; i < data.length; i++) {
    const slice = data.slice(i - n + 1, i + 1)
    const hh = Math.max(...slice.map(s => s.high))
    const ll = Math.min(...slice.map(s => s.low))
    const rsv = hh === ll ? 0 : ((data[i]!.close - ll) / (hh - ll)) * 100
    const curK = (prevK * (kSmooth - 1) + rsv) / kSmooth
    const curD = (prevD * (dSmooth - 1) + curK) / dSmooth
    k.push({ time: data[i]!.date, value: round(curK) })
    d.push({ time: data[i]!.date, value: round(curD) })
    prevK = curK
    prevD = curD
  }
  return { k, d }
}

/** MACD（快 12、慢 26、訊號 9） */
export function calcMACD(
  data: OHLC[], fast = 12, slow = 26, signal = 9,
): { dif: Point[]; dea: Point[]; hist: Point[] } {
  const closes = data.map(d => d.close)
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const difRaw = closes.map((_, i) => emaFast[i]! - emaSlow[i]!)
  const deaRaw = ema(difRaw, signal)
  const dif: Point[] = []
  const dea: Point[] = []
  const hist: Point[] = []
  // 慢線穩定後才有效（slow-1 起）
  for (let i = slow - 1; i < data.length; i++) {
    dif.push({ time: data[i]!.date, value: round(difRaw[i]!) })
    dea.push({ time: data[i]!.date, value: round(deaRaw[i]!) })
    hist.push({ time: data[i]!.date, value: round((difRaw[i]! - deaRaw[i]!) * 2) })
  }
  return { dif, dea, hist }
}

/** 簡單移動平均（收盤價，預設 20 日） */
export function calcMA(data: OHLC[], period = 20): Point[] {
  const out: Point[] = []
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, d) => s + d.close, 0) / period
    out.push({ time: data[i]!.date, value: round(avg) })
  }
  return out
}

/** 布林通道（中線=SMA，上下軌 = 中線 ± N 倍標準差，預設 20 日、2 倍標準差） */
export function calcBollingerBands(
  data: OHLC[], period = 20, stdDev = 2,
): { upper: Point[]; mid: Point[]; lower: Point[] } {
  const mid = calcMA(data, period)
  const upper: Point[] = []
  const lower: Point[] = []
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, d) => s + d.close, 0) / period
    const variance = slice.reduce((s, d) => s + (d.close - avg) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    const time = data[i]!.date
    upper.push({ time, value: round(avg + stdDev * sd) })
    lower.push({ time, value: round(avg - stdDev * sd) })
  }
  return { upper, mid, lower }
}

function ema(values: number[], period: number): number[] {
  const out: number[] = []
  const k = 2 / (period + 1)
  let prev = values[0] ?? 0
  out.push(prev)
  for (let i = 1; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}
