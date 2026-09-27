import { describe, expect, it } from 'vitest'
import { assignMarkers } from './markers'

const daily = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']
const weekly = ['2026-09-18', '2026-09-25'] // 週 K 日期 = 該週最後一個交易日

describe('assignMarkers', () => {
  it('日線：訊號對到同一天的 K 棒；同棒同方向合併並列出全部說明', () => {
    const out = assignMarkers(daily, [
      { date: '2026-09-22', side: 'bull', label: 'KD 低檔黃金交叉' },
      { date: '2026-09-22', side: 'bull', label: '爆量' },
      { date: '2026-09-24', side: 'bear', label: 'RSI 進入超買' },
    ])
    expect(out).toEqual([
      { time: '2026-09-22', side: 'bull', labels: ['KD 低檔黃金交叉', '爆量'] },
      { time: '2026-09-24', side: 'bear', labels: ['RSI 進入超買'] },
    ])
  })

  it('週線：訊號歸入日期 ≥ 訊號日的第一根 K 棒', () => {
    const out = assignMarkers(weekly, [
      { date: '2026-09-15', side: 'bull', label: 'a' },
      { date: '2026-09-22', side: 'bull', label: 'b' },
      { date: '2026-09-24', side: 'bear', label: 'c' },
    ])
    expect(out).toEqual([
      { time: '2026-09-18', side: 'bull', labels: ['a'] },
      { time: '2026-09-25', side: 'bull', labels: ['b'] },
      { time: '2026-09-25', side: 'bear', labels: ['c'] },
    ])
  })

  it('超出 K 棒範圍的訊號略過；輸出依時間排序', () => {
    expect(assignMarkers(daily, [
      { date: '2026-09-30', side: 'bull', label: 'late' },
      { date: '2026-01-01', side: 'bull', label: 'early' },
    ])).toEqual([{ time: '2026-09-21', side: 'bull', labels: ['early'] }])
    expect(assignMarkers([], [{ date: '2026-09-22', side: 'bull', label: 'x' }])).toEqual([])
  })
})
