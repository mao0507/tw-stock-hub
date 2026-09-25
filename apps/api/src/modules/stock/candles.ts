export type Candle = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  changePct: number | null
}

/** YYYY-MM-DD 所屬週的週一（以 UTC 計算，避免伺服器時區影響） */
export function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const offset = (d.getUTCDay() + 6) % 7 // 週一 = 0
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

export const monthKey = (date: string) => date.slice(0, 7)

/**
 * 日 K（由舊到新）彙總成週 K / 月 K：開 = 首日開、收 = 末日收、高低取極值、量加總。
 * 日期取該區間最後一個交易日；彙總後無漲跌幅。
 */
export function aggregate(daily: readonly Candle[], keyOf: (date: string) => string): Candle[] {
  const buckets = new Map<string, Candle[]>()
  for (const c of daily) {
    const k = keyOf(c.date)
    const bucket = buckets.get(k)
    if (bucket) bucket.push(c)
    else buckets.set(k, [c])
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => ({
      date: g.at(-1)!.date,
      open: g[0]!.open,
      high: Math.max(...g.map((c) => c.high)),
      low: Math.min(...g.map((c) => c.low)),
      close: g.at(-1)!.close,
      volume: g.reduce((s, c) => s + c.volume, 0),
      changePct: null,
    }))
}
