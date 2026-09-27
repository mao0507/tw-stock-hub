// K 線標記：把「日期＋多空＋說明」對應到實際 K 棒（日／週／月線），同棒同方向合併。

export type MarkerSide = 'bull' | 'bear'

export interface ChartMarker {
  date: string
  side: MarkerSide
  label: string
}

export interface BarMarker {
  /** 對應 K 棒的日期（週／月 K 為該區間最後一個交易日） */
  time: string
  side: MarkerSide
  labels: string[]
}

/** 第一個日期 ≥ target 的索引；都比 target 小回 -1（barDates 需升冪） */
export function firstAtOrAfter(barDates: readonly string[], target: string): number {
  let lo = 0
  let hi = barDates.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (barDates[mid]! < target) lo = mid + 1
    else hi = mid
  }
  return lo < barDates.length ? lo : -1
}

/**
 * K 棒日期為區間最後一個交易日（日線即當天），所以訊號歸入「日期 ≥ 訊號日」的第一根 K 棒。
 * 早於第一根 K 棒區間的訊號會落到第一根；晚於最後一根的略過。
 */
export function assignMarkers(barDates: readonly string[], markers: readonly ChartMarker[]): BarMarker[] {
  const merged = new Map<string, BarMarker>()
  for (const m of markers) {
    const i = firstAtOrAfter(barDates, m.date)
    if (i < 0) continue
    const time = barDates[i]!
    const key = `${time}|${m.side}`
    const cur = merged.get(key)
    if (cur) cur.labels.push(m.label)
    else merged.set(key, { time, side: m.side, labels: [m.label] })
  }
  const sideOrder = (s: MarkerSide) => (s === 'bull' ? 0 : 1) // 同棒多方在前
  return [...merged.values()].sort((a, b) => a.time.localeCompare(b.time) || sideOrder(a.side) - sideOrder(b.side))
}
