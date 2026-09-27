import { describe, expect, it } from 'vitest'
import { hitTest, snapTime, type ChartDrawing, type DrawingPoint } from './drawings'

const weekly = ['2026-09-18', '2026-09-25']

describe('snapTime', () => {
  it('對到日期 ≥ 目標的第一根；超過最後一根對到最後一根；沒有 K 棒回 null', () => {
    expect(snapTime(weekly, '2026-09-16')).toBe('2026-09-18')
    expect(snapTime(weekly, '2026-09-18')).toBe('2026-09-18')
    expect(snapTime(weekly, '2026-09-22')).toBe('2026-09-25')
    expect(snapTime(weekly, '2026-10-02')).toBe('2026-09-25')
    expect(snapTime([], '2026-09-22')).toBeNull()
  })
})

describe('hitTest', () => {
  // 假座標：x = 日期的「日」× 10，y = 1000 − 價格
  const toXY = (p: DrawingPoint) => ({ x: Number(p.time.slice(8)) * 10, y: 1000 - p.price })
  const drawings: ChartDrawing[] = [
    { id: 'h', kind: 'hline', points: [{ time: '2026-09-01', price: 500 }] },
    { id: 't', kind: 'trend', points: [{ time: '2026-09-10', price: 600 }, { time: '2026-09-20', price: 700 }] },
  ]

  it('水平線：只看 y，容許誤差內命中', () => {
    expect(hitTest(drawings, toXY, 50, 504)).toEqual({ id: 'h', handle: 'line' })
    expect(hitTest(drawings, toXY, 50, 520)).toBeNull()
  })

  it('趨勢線：端點優先，其次線身', () => {
    expect(hitTest(drawings, toXY, 101, 401)).toEqual({ id: 't', handle: 0 })
    expect(hitTest(drawings, toXY, 200, 300)).toEqual({ id: 't', handle: 1 })
    expect(hitTest(drawings, toXY, 150, 350)).toEqual({ id: 't', handle: 'line' })
    expect(hitTest(drawings, toXY, 150, 380)).toBeNull()
  })

  it('不在可見範圍的點略過；後畫的優先', () => {
    expect(hitTest(drawings, () => ({ x: null, y: null }), 100, 400)).toBeNull()
    const overlap: ChartDrawing[] = [
      { id: 'a', kind: 'hline', points: [{ time: '2026-09-01', price: 500 }] },
      { id: 'b', kind: 'hline', points: [{ time: '2026-09-01', price: 501 }] },
    ]
    expect(hitTest(overlap, toXY, 0, 500)?.id).toBe('b')
  })
})
