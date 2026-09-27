// K 線畫線（#37）的繪製與互動：水平線用 price line、趨勢線用兩點 LineSeries。
// 可編輯時：工具列選模式後點圖新增；點線選取；拖曳水平線或趨勢線端點調整（拖曳中暫停圖表捲動縮放）。
import { onUnmounted, ref, watch, type Ref } from 'vue'
import { LineSeries, type IChartApi, type IPriceLine, type ISeriesApi, type Time } from 'lightweight-charts'
import { hitTest, snapTime, type ChartDrawing, type DrawingHit, type DrawingKind, type DrawingPoint } from '../utils/drawings'

type Mode = 'none' | DrawingKind
const COLOR = '#1f4d3a'
const COLOR_SELECTED = '#b7791f'
const round2 = (v: number) => Math.round(v * 100) / 100

export function useChartDrawings(opts: {
  chart: Ref<IChartApi | null>
  container: Ref<HTMLElement | null>
  getSeries: () => ISeriesApi<'Candlestick'> | null
  drawings: () => ChartDrawing[]
  barDates: () => string[]
  editable: () => boolean
  onCreate: (d: { kind: DrawingKind; points: DrawingPoint[] }) => void
  onUpdate: (id: string, points: DrawingPoint[]) => void
}) {
  const mode = ref<Mode>('none')
  const pending = ref<DrawingPoint | null>(null)
  const selectedId = ref<string | null>(null)
  /** 拖曳中的暫時點位（放開才送出） */
  const override = ref<{ id: string; points: DrawingPoint[] } | null>(null)

  let priceLines: { series: ISeriesApi<'Candlestick'>; line: IPriceLine }[] = []
  let trendSeries: ISeriesApi<'Line'>[] = []

  const effective = (): ChartDrawing[] =>
    opts.drawings().map((d) => (override.value?.id === d.id ? { ...d, points: override.value.points } : d))

  function clear(): void {
    for (const { series, line } of priceLines) {
      try { series.removePriceLine(line) } catch { /* series 已重建 */ }
    }
    priceLines = []
    for (const s of trendSeries) {
      try { opts.chart.value?.removeSeries(s) } catch { /* chart 已重建 */ }
    }
    trendSeries = []
  }

  function render(): void {
    clear()
    const chart = opts.chart.value
    const series = opts.getSeries()
    const dates = opts.barDates()
    if (!chart || !series || !dates.length) return
    for (const d of effective()) {
      const color = d.id === selectedId.value ? COLOR_SELECTED : COLOR
      if (d.kind === 'hline') {
        const line = series.createPriceLine({
          price: d.points[0]!.price, color, lineWidth: d.id === selectedId.value ? 2 : 1, lineStyle: 0, axisLabelVisible: true, title: '',
        })
        priceLines.push({ series, line })
        continue
      }
      // 週／月線把點位對到該區間的 K 棒；兩點落在同一根就不畫
      const pts = d.points
        .map((p) => ({ time: snapTime(dates, p.time), value: p.price }))
        .filter((p): p is { time: string; value: number } => p.time != null)
        .sort((a, b) => a.time.localeCompare(b.time))
      if (pts.length !== 2 || pts[0]!.time === pts[1]!.time) continue
      const s = chart.addSeries(LineSeries, {
        color, lineWidth: d.id === selectedId.value ? 3 : 2,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      })
      s.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })))
      trendSeries.push(s)
    }
  }

  const toXY = (p: DrawingPoint) => {
    const dates = opts.barDates()
    const t = snapTime(dates, p.time)
    return {
      x: t ? opts.chart.value?.timeScale().timeToCoordinate(t as Time) ?? null : null,
      y: opts.getSeries()?.priceToCoordinate(p.price) ?? null,
    }
  }
  const pointAt = (x: number, y: number): DrawingPoint | null => {
    const price = opts.getSeries()?.coordinateToPrice(y)
    const time = opts.chart.value?.timeScale().coordinateToTime(x)
    if (price == null || time == null) return null
    return { time: String(time), price: round2(price) }
  }
  const localXY = (e: MouseEvent) => {
    const r = opts.container.value!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // ── 點擊：新增或選取
  function onClick(e: MouseEvent): void {
    if (!opts.editable()) return
    const { x, y } = localXY(e)
    if (mode.value === 'none') {
      selectedId.value = hitTest(effective(), toXY, x, y)?.id ?? null
      render()
      return
    }
    const p = pointAt(x, y)
    if (!p) return
    if (mode.value === 'hline') {
      opts.onCreate({ kind: 'hline', points: [p] })
      mode.value = 'none'
    } else if (!pending.value) {
      pending.value = p
    } else {
      if (p.time !== pending.value.time) opts.onCreate({ kind: 'trend', points: [pending.value, p] })
      pending.value = null
      mode.value = 'none'
    }
  }

  // ── 拖曳：水平線整條上下移、趨勢線拖端點
  let drag: DrawingHit | null = null
  const setInteractive = (on: boolean) =>
    opts.chart.value?.applyOptions({ handleScroll: on, handleScale: on })

  function onDown(e: MouseEvent): void {
    if (!opts.editable() || mode.value !== 'none' || e.button !== 0) return
    const { x, y } = localXY(e)
    const hit = hitTest(effective(), toXY, x, y)
    if (!hit || (hit.handle === 'line' && opts.drawings().find((d) => d.id === hit.id)?.kind === 'trend')) return
    drag = hit
    selectedId.value = hit.id
    setInteractive(false)
    e.preventDefault()
  }
  function onMove(e: MouseEvent): void {
    if (!drag || !opts.container.value) return
    const d = opts.drawings().find((x) => x.id === drag!.id)
    if (!d) return
    const { x, y } = localXY(e)
    const cur = override.value?.id === d.id ? override.value.points : d.points
    let next: DrawingPoint[]
    if (d.kind === 'hline') {
      const price = opts.getSeries()?.coordinateToPrice(y)
      if (price == null) return
      next = [{ ...cur[0]!, price: round2(price) }]
    } else {
      const p = pointAt(x, y)
      if (!p) return
      next = cur.map((q, i) => (i === drag!.handle ? p : q))
    }
    override.value = { id: d.id, points: next }
    render()
  }
  function onUp(): void {
    if (!drag) return
    const o = override.value
    drag = null
    setInteractive(true)
    if (o) opts.onUpdate(o.id, o.points)
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { mode.value = 'none'; pending.value = null }
  }

  watch(opts.container, (el, old) => {
    old?.removeEventListener('click', onClick)
    old?.removeEventListener('mousedown', onDown, true)
    el?.addEventListener('click', onClick)
    el?.addEventListener('mousedown', onDown, true)
  }, { immediate: true })
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('keydown', onKey)
  onUnmounted(() => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('keydown', onKey)
  })

  // 送出更新後，等父層帶回新資料再清掉暫時點位
  watch(() => opts.drawings(), () => { override.value = null; render() }, { deep: true })

  function setMode(m: Mode): void {
    mode.value = mode.value === m ? 'none' : m
    pending.value = null
    selectedId.value = null
    render()
  }

  return { mode, pending, selectedId, render, setMode }
}
