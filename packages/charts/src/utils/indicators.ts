// 技術指標計算，輸入為依日期升冪的 OHLC。KD／MACD／RSI 公式與 crawler analytics/technical.py 一致。

export interface OHLC {
  date: string
  high: number
  low: number
  close: number
  /** OBV 用；單位由呼叫端決定（K 線傳張） */
  volume?: number
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

/** OBV 能量潮：收漲加量、收跌減量、平盤不變，自第一根起算 0 */
export function calcOBV(data: OHLC[]): Point[] {
  let obv = 0
  return data.map((d, i) => {
    if (i > 0) {
      const diff = d.close - data[i - 1]!.close
      obv += diff > 0 ? (d.volume ?? 0) : diff < 0 ? -(d.volume ?? 0) : 0
    }
    return { time: d.date, value: round(obv) }
  })
}

/** 真實區間（第一根為高低差） */
function trueRange(data: OHLC[]): number[] {
  return data.map((d, i) => {
    if (i === 0) return d.high - d.low
    const pc = data[i - 1]!.close
    return Math.max(d.high - d.low, Math.abs(d.high - pc), Math.abs(d.low - pc))
  })
}

/** ATR 平均真實區間（預設 14，Wilder 平滑） */
export function calcATR(data: OHLC[], period = 14): Point[] {
  if (data.length < period) return []
  const tr = trueRange(data)
  let atr = tr.slice(0, period).reduce((s, v) => s + v, 0) / period
  const out: Point[] = [{ time: data[period - 1]!.date, value: round(atr) }]
  for (let i = period; i < data.length; i++) {
    atr = (atr * (period - 1) + tr[i]!) / period
    out.push({ time: data[i]!.date, value: round(atr) })
  }
  return out
}

/** 威廉指標 %R（預設 14）：(收盤 − 最高) ÷ (最高 − 最低) × 100，範圍 −100～0 */
export function calcWilliamsR(data: OHLC[], period = 14): Point[] {
  const out: Point[] = []
  for (let i = period - 1; i < data.length; i++) {
    const w = data.slice(i - period + 1, i + 1)
    const hh = Math.max(...w.map(s => s.high))
    const ll = Math.min(...w.map(s => s.low))
    out.push({ time: data[i]!.date, value: hh === ll ? 0 : round(((data[i]!.close - hh) / (hh - ll)) * 100) })
  }
  return out
}

/** 乖離率（預設 20 日）：(收盤 − 均線) ÷ 均線 × 100 */
export function calcBias(data: OHLC[], period = 20): Point[] {
  const out: Point[] = []
  for (let i = period - 1; i < data.length; i++) {
    const ma = data.slice(i - period + 1, i + 1).reduce((s, d) => s + d.close, 0) / period
    out.push({ time: data[i]!.date, value: round(((data[i]!.close - ma) / ma) * 100) })
  }
  return out
}

/** DMI 趨向指標（預設 14，Wilder 平滑）：+DI、−DI 自第 period 根起，ADX 自第 2×period−1 根起 */
export function calcDMI(data: OHLC[], period = 14): { pdi: Point[]; mdi: Point[]; adx: Point[] } {
  const pdi: Point[] = []
  const mdi: Point[] = []
  const adx: Point[] = []
  if (data.length <= period) return { pdi, mdi, adx }
  const tr = trueRange(data)
  const plusDM = data.map((d, i) => {
    if (i === 0) return 0
    const up = d.high - data[i - 1]!.high
    const down = data[i - 1]!.low - d.low
    return up > down && up > 0 ? up : 0
  })
  const minusDM = data.map((d, i) => {
    if (i === 0) return 0
    const up = d.high - data[i - 1]!.high
    const down = data[i - 1]!.low - d.low
    return down > up && down > 0 ? down : 0
  })
  const sum = (a: number[]) => a.slice(1, period + 1).reduce((s, v) => s + v, 0)
  let sTR = sum(tr)
  let sP = sum(plusDM)
  let sM = sum(minusDM)
  const dx: number[] = []
  let adxVal = 0
  for (let i = period; i < data.length; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i]!
      sP = sP - sP / period + plusDM[i]!
      sM = sM - sM / period + minusDM[i]!
    }
    const p = sTR ? (100 * sP) / sTR : 0
    const m = sTR ? (100 * sM) / sTR : 0
    const time = data[i]!.date
    pdi.push({ time, value: round(p) })
    mdi.push({ time, value: round(m) })
    dx.push(p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m))
    if (dx.length === period) adxVal = dx.reduce((s, v) => s + v, 0) / period
    else if (dx.length > period) adxVal = (adxVal * (period - 1) + dx.at(-1)!) / period
    if (dx.length >= period) adx.push({ time, value: round(adxVal) })
  }
  return { pdi, mdi, adx }
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
