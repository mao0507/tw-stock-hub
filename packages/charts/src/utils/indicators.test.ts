import { describe, expect, it } from 'vitest'
import {
  calcATR, calcBias, calcDMI, calcKD, calcMACD, calcOBV, calcRSI, calcWilliamsR, type OHLC, type Point,
} from './indicators'

// 期望值由 crawler analytics/technical.py 的公式（與另一份獨立 Python 實作）計算
const closes = [10, 10, 10, 9, 8, 12, 14, 15, 11, 9, 8]
const data: OHLC[] = closes.map((c, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`, high: c, low: c - 1, close: c, volume: (i + 1) * 100,
}))
const values = (pts: Point[]) => pts.map(p => p.value)
const fromIndex = (pts: Point[]) => data.findIndex(d => d.date === pts[0]!.time)

describe('既有指標', () => {
  it('KD(3)', () => {
    const { k, d } = calcKD(data, 3)
    expect(fromIndex(k)).toBe(2)
    expect(values(k)).toEqual([66.67, 61.11, 51.85, 67.9, 78.6, 85.73, 63.82, 47.31, 39.87])
    expect(values(d)).toEqual([55.56, 57.41, 55.56, 59.67, 65.98, 72.57, 69.65, 62.2, 54.76])
  })

  it('RSI(2)', () => {
    const r = calcRSI(data, 2)
    expect(fromIndex(r)).toBe(2)
    expect(values(r)).toEqual([100, 0, 0, 84.21, 91.43, 94.12, 26.82, 15.64, 11.03])
  })

  it('MACD(2,3,2)', () => {
    const { dif, dea, hist } = calcMACD(data, 2, 3, 2)
    expect(fromIndex(dif)).toBe(2)
    expect(values(dif)).toEqual([0, -0.17, -0.31, 0.44, 0.75, 0.72, -0.19, -0.61, -0.65])
    expect(values(dea)).toEqual([0, -0.11, -0.24, 0.21, 0.57, 0.67, 0.09, -0.38, -0.56])
    expect(hist[3]!.value).toBeGreaterThan(0)
  })
})

describe('新增指標', () => {
  it('OBV：漲加量、跌減量、平盤不變', () => {
    expect(values(calcOBV(data))).toEqual([0, 0, 0, -400, -900, -300, 400, 1200, 300, -700, -1800])
  })

  it('ATR(3)：首值為前 3 根 TR 平均，之後 Wilder 平滑', () => {
    const a = calcATR(data, 3)
    expect(fromIndex(a)).toBe(2)
    expect(values(a)).toEqual([1, 1.33, 1.56, 2.37, 2.25, 1.83, 2.89, 2.93, 2.62])
  })

  it('威廉 %R(3)', () => {
    expect(values(calcWilliamsR(data, 3))).toEqual([0, -50, -66.67, 0, 0, 0, -80, -85.71, -75])
  })

  it('乖離率(3)', () => {
    expect(values(calcBias(data, 3))).toEqual([0, -6.9, -11.11, 24.14, 23.53, 9.76, -17.5, -22.86, -14.29])
  })

  it('DMI(3)', () => {
    const { pdi, mdi, adx } = calcDMI(data, 3)
    expect(fromIndex(pdi)).toBe(3)
    expect(values(pdi)).toEqual([0, 0, 56.25, 69.23, 74.83, 31.64, 20.82, 15.52])
    // 15.625：四捨五入取 15.63（Python round 為銀行家捨入 15.62）
    expect(values(mdi)).toEqual([25, 35.71, 15.63, 10.99, 8.99, 49.98, 55.68, 54.23])
    expect(fromIndex(adx)).toBe(5)
    expect(values(adx)).toEqual([85.51, 81.21, 80.32, 61.04, 55.88, 55.76])
  })

  it('資料不足回空陣列', () => {
    expect(calcATR(data.slice(0, 2), 3)).toEqual([])
    expect(calcDMI(data.slice(0, 3), 3).pdi).toEqual([])
  })
})
