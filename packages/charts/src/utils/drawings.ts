// K 線畫線（#37）：水平線（1 點，只看價格）與趨勢線（2 點）。這裡只放純函式：時間對齊與點擊判定。
import { firstAtOrAfter } from './markers'

export type DrawingKind = 'hline' | 'trend'
export interface DrawingPoint { time: string; price: number }
export interface ChartDrawing { id: string; kind: DrawingKind; points: DrawingPoint[] }
export type DrawingHit = { id: string; handle: 'line' | 0 | 1 }

/** 把日期對到實際 K 棒（週／月線為區間最後一天）；超過最後一根對到最後一根 */
export function snapTime(barDates: readonly string[], date: string): string | null {
  if (!barDates.length) return null
  const i = firstAtOrAfter(barDates, date)
  return barDates[i < 0 ? barDates.length - 1 : i]!
}

/** 點到線段距離（像素） */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * 找出滑鼠位置命中的畫線：趨勢線端點優先（可拖曳端點），其次線身；後畫的在上層優先。
 * toXY 回 null 代表該點不在可見範圍。
 */
export function hitTest(
  drawings: readonly ChartDrawing[],
  toXY: (p: DrawingPoint) => { x: number | null; y: number | null },
  x: number,
  y: number,
  tolerance = 6,
): DrawingHit | null {
  for (const d of [...drawings].reverse()) {
    if (d.kind === 'hline') {
      const py = toXY(d.points[0]!).y
      if (py != null && Math.abs(py - y) <= tolerance) return { id: d.id, handle: 'line' }
      continue
    }
    const [a, b] = d.points.map(toXY)
    if (a?.x == null || a.y == null || b?.x == null || b.y == null) continue
    if (Math.hypot(a.x - x, a.y - y) <= tolerance + 2) return { id: d.id, handle: 0 }
    if (Math.hypot(b.x - x, b.y - y) <= tolerance + 2) return { id: d.id, handle: 1 }
    if (segmentDistance(x, y, a.x, a.y, b.x, b.y) <= tolerance) return { id: d.id, handle: 'line' }
  }
  return null
}
