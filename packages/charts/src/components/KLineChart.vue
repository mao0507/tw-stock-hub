<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import {
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  type CandlestickData,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type LineData,
  type HistogramData,
  type Time,
} from 'lightweight-charts'
import type { DailyQuote } from '@tw-stock-hub/types'
import { useTradingViewChart } from '../composables/useTradingViewChart'
import { STOCK_COLORS } from '../theme/echarts-theme'
import {
  calcATR, calcBias, calcBollingerBands, calcDMI, calcKD, calcMA, calcMACD, calcOBV, calcRSI, calcWilliamsR, type OHLC,
} from '../utils/indicators'
import { withDefaults as withParamDefaults, type PartialIndicatorParams } from '../utils/indicator-params'
import { assignMarkers, type ChartMarker } from '../utils/markers'

type Interval = 'daily' | 'weekly' | 'monthly'
type MAKey = 5 | 10 | 20 | 60
type Indicator = 'none' | 'kd' | 'macd' | 'rsi' | 'boll' | 'obv' | 'atr' | 'wr' | 'bias' | 'dmi'

interface Props {
  data: DailyQuote[]
  interval?: Interval
  height?: number
  showMA?: boolean
  /** K 棒上的標記（例如技術訊號）；未傳則不顯示開關 */
  markers?: ChartMarker[]
  /** 指標參數（使用者偏好）；缺的用預設 */
  indicatorParams?: PartialIndicatorParams | null
}

const props = withDefaults(defineProps<Props>(), {
  interval: 'daily',
  height: 320,
  showMA: true,
})

const emit = defineEmits<{
  'interval-change': [interval: Interval]
}>()

const intervals: { value: Interval; label: string }[] = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '週' },
  { value: 'monthly', label: '月' },
]

const indicator = ref<Indicator>('none')
const indicators: { value: Indicator; label: string }[] = [
  { value: 'none', label: '無' },
  { value: 'kd', label: 'KD' },
  { value: 'macd', label: 'MACD' },
  { value: 'rsi', label: 'RSI' },
  { value: 'boll', label: 'BOLL' },
  { value: 'obv', label: 'OBV' },
  { value: 'atr', label: 'ATR' },
  { value: 'wr', label: '威廉' },
  { value: 'bias', label: '乖離' },
  { value: 'dmi', label: 'DMI' },
]
const params = computed(() => withParamDefaults(props.indicatorParams))

const { chartContainer, chart, isReady } = useTradingViewChart({ height: props.height })

// 標記開關：個人偏好，記在瀏覽器即可
const MARKER_KEY = 'kline:showMarkers'
const readPref = () => { try { return localStorage.getItem(MARKER_KEY) !== '0' } catch { return true } }
const showMarkers = ref(readPref())
function toggleMarkers(): void {
  showMarkers.value = !showMarkers.value
  try { localStorage.setItem(MARKER_KEY, showMarkers.value ? '1' : '0') } catch { /* 無痕模式等 */ }
}
const barMarkers = computed(() =>
  props.markers && showMarkers.value ? assignMarkers(props.data.map(d => d.date), props.markers) : [],
)

// hover legend
const hoverDate = ref<string | null>(null)
const legend = computed(() => {
  const data = props.data
  if (!data.length) return null
  const item = hoverDate.value
    ? data.find(d => d.date === hoverDate.value) ?? data[data.length - 1]
    : data[data.length - 1]
  if (!item) return null
  const idx = data.indexOf(item)
  const prev = idx > 0 ? data[idx - 1] : null
  const change = prev ? item.close - prev.close : (item.changePct ?? 0)
  const pct = prev && prev.close ? (change / prev.close) * 100 : (item.changePct ?? 0)
  return {
    date: item.date,
    open: item.open, high: item.high, low: item.low, close: item.close,
    change, pct,
    lots: Math.round(item.volume / 1000),
    up: change >= 0,
    marks: barMarkers.value.filter(m => m.time === item.date),
  }
})

function toOHLC(data: DailyQuote[]): OHLC[] {
  return data.map(d => ({ date: d.date, high: d.high, low: d.low, close: d.close, volume: Math.round(d.volume / 1000) }))
}

function maLineData(data: DailyQuote[], period: MAKey): LineData<Time>[] {
  return calcMA(toOHLC(data), period).map(p => ({ time: p.time as Time, value: p.value }))
}

const MA_COLORS: Record<MAKey, string> = {
  5: '#F59E0B',
  10: '#3B82F6',
  20: '#8B5CF6',
  60: '#EC4899',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let candleSeries: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let volumeSeries: any = null
let markersApi: ISeriesMarkersPluginApi<Time> | null = null

function updateMarkers(): void {
  if (!candleSeries) return
  const list: SeriesMarker<Time>[] = barMarkers.value.map(m => ({
    time: m.time as Time,
    position: m.side === 'bull' ? 'belowBar' : 'aboveBar',
    shape: m.side === 'bull' ? 'arrowUp' : 'arrowDown',
    color: m.side === 'bull' ? STOCK_COLORS.up : STOCK_COLORS.down,
    size: 1,
  }))
  if (markersApi) markersApi.setMarkers(list)
  else markersApi = createSeriesMarkers(candleSeries, list)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const maSeriesMap = new Map<MAKey, any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let indicatorSeries: any[] = []
// 布林通道是價格疊加層（掛在主圖 pane 0），與震盪指標（pane 1）分開管理
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bollSeries: any[] = []

function rebuildBoll(): void {
  if (!chart.value) return
  for (const s of bollSeries) chart.value.removeSeries(s)
  bollSeries = []
  if (indicator.value !== 'boll' || !props.data.length) return

  const ohlc = toOHLC(props.data)
  const { upper, mid, lower } = calcBollingerBands(ohlc, params.value.boll.period, params.value.boll.stdDev)
  const line = (color: string, dashed = false) =>
    chart.value!.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      lineStyle: dashed ? 2 : 0,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
  const toData = (pts: { time: string; value: number }[]) =>
    pts.map(p => ({ time: p.time as Time, value: p.value }))

  const upperS = line('#9CA3AF', true); upperS.setData(toData(upper))
  const midS = line('#6366F1'); midS.setData(toData(mid))
  const lowerS = line('#9CA3AF', true); lowerS.setData(toData(lower))
  bollSeries = [upperS, midS, lowerS]
}

function rebuildIndicator(): void {
  if (!chart.value) return
  for (const s of indicatorSeries) chart.value.removeSeries(s)
  indicatorSeries = []
  rebuildBoll()
  if (indicator.value === 'none' || indicator.value === 'boll' || !props.data.length) { layoutPanes(); return }

  const ohlc = toOHLC(props.data)
  const p = params.value
  const pane = 1
  const line = (color: string) =>
    chart.value!.addSeries(LineSeries, {
      color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    }, pane)
  const toData = (pts: { time: string; value: number }[]) =>
    pts.map(p => ({ time: p.time as Time, value: p.value }))

  if (indicator.value === 'kd') {
    const { k, d } = calcKD(ohlc, p.kd.period)
    const kS = line('#F59E0B'); kS.setData(toData(k))
    const dS = line('#3B82F6'); dS.setData(toData(d))
    indicatorSeries = [kS, dS]
  } else if (indicator.value === 'rsi') {
    const rS = line('#8B5CF6'); rS.setData(toData(calcRSI(ohlc, p.rsi.period)))
    indicatorSeries = [rS]
  } else if (indicator.value === 'macd') {
    const { dif, dea, hist } = calcMACD(ohlc, p.macd.fast, p.macd.slow, p.macd.signal)
    const hS = chart.value.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
    hS.setData(hist.map(p => ({ time: p.time as Time, value: p.value, color: p.value >= 0 ? STOCK_COLORS.upMid : STOCK_COLORS.downMid })))
    const difS = line('#F59E0B'); difS.setData(toData(dif))
    const deaS = line('#3B82F6'); deaS.setData(toData(dea))
    indicatorSeries = [hS, difS, deaS]
  } else if (indicator.value === 'obv') {
    const s = line('#6366F1'); s.setData(toData(calcOBV(ohlc)))
    indicatorSeries = [s]
  } else if (indicator.value === 'atr') {
    const s = line('#0EA5E9'); s.setData(toData(calcATR(ohlc, p.atr.period)))
    indicatorSeries = [s]
  } else if (indicator.value === 'wr') {
    const s = line('#8B5CF6'); s.setData(toData(calcWilliamsR(ohlc, p.wr.period)))
    indicatorSeries = [s]
  } else if (indicator.value === 'bias') {
    const s = line('#F59E0B'); s.setData(toData(calcBias(ohlc, p.bias.period)))
    indicatorSeries = [s]
  } else if (indicator.value === 'dmi') {
    const { pdi, mdi, adx } = calcDMI(ohlc, p.dmi.period)
    const pS = line(STOCK_COLORS.up); pS.setData(toData(pdi))
    const mS = line(STOCK_COLORS.down); mS.setData(toData(mdi))
    const aS = line('#6B7280'); aS.setData(toData(adx))
    indicatorSeries = [pS, mS, aS]
  }
  layoutPanes()
}

function layoutPanes(): void {
  const panes = chart.value?.panes() ?? []
  if (panes.length > 1) {
    panes[0]?.setStretchFactor(3)
    panes[1]?.setStretchFactor(1)
  }
}

function initSeries(): void {
  if (!chart.value || !isReady.value) return

  for (const s of maSeriesMap.values()) chart.value.removeSeries(s)
  maSeriesMap.clear()
  for (const s of bollSeries) chart.value.removeSeries(s)
  bollSeries = []
  for (const s of indicatorSeries) chart.value.removeSeries(s)
  indicatorSeries = []
  if (candleSeries) { chart.value.removeSeries(candleSeries); candleSeries = null; markersApi = null }
  if (volumeSeries) { chart.value.removeSeries(volumeSeries); volumeSeries = null }

  candleSeries = chart.value.addSeries(CandlestickSeries, {
    upColor: STOCK_COLORS.up,
    downColor: STOCK_COLORS.down,
    borderUpColor: STOCK_COLORS.up,
    borderDownColor: STOCK_COLORS.down,
    wickUpColor: STOCK_COLORS.up,
    wickDownColor: STOCK_COLORS.down,
  })

  // 成交量：底部 histogram，獨立 price scale，共用同一時間軸
  volumeSeries = chart.value.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    lastValueVisible: false,
    priceLineVisible: false,
  })
  chart.value.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.82, bottom: 0 },
  })

  if (props.showMA) {
    for (const period of [5, 10, 20, 60] as MAKey[]) {
      const maSeries = chart.value.addSeries(LineSeries, {
        color: MA_COLORS[period],
        lineWidth: 1,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      maSeriesMap.set(period, maSeries)
    }
  }
}

function updateData(): void {
  if (!candleSeries || !props.data.length) return

  const candles: CandlestickData<Time>[] = props.data.map(d => ({
    time: d.date as Time,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }))
  candleSeries.setData(candles)

  if (volumeSeries) {
    const vols: HistogramData<Time>[] = props.data.map((d, i) => {
      const up = i === 0 ? true : d.close >= (props.data[i - 1]?.close ?? d.close)
      return {
        time: d.date as Time,
        value: Math.round(d.volume / 1000), // 股數 → 張
        color: up ? STOCK_COLORS.upMid : STOCK_COLORS.downMid,
      }
    })
    volumeSeries.setData(vols)
  }

  if (props.showMA) {
    for (const [period, series] of maSeriesMap.entries()) {
      series.setData(maLineData(props.data, period))
    }
  }

  rebuildIndicator()
  updateMarkers()
  chart.value?.timeScale().fitContent()
}

function bindCrosshair(): void {
  chart.value?.subscribeCrosshairMove((param) => {
    hoverDate.value = param.time ? String(param.time) : null
  })
}

watch(isReady, (ready) => { if (ready) { initSeries(); updateData(); bindCrosshair() } })
watch(() => props.data, () => updateData(), { deep: false })
watch([indicator, params], () => rebuildIndicator())
watch(barMarkers, () => updateMarkers())
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-1">
      <button
        v-for="iv in intervals"
        :key="iv.value"
        :class="[
          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
          interval === iv.value ? 'bg-ink text-white' : 'text-gray-500 hover:bg-gray-100',
        ]"
        @click="emit('interval-change', iv.value)"
      >
        {{ iv.label }}
      </button>

      <div v-if="showMA" class="ml-3 hidden items-center gap-3 md:flex">
        <span
          v-for="[period, color] in Object.entries(MA_COLORS)"
          :key="period"
          class="flex items-center gap-1 text-xs text-gray-400"
        >
          <span class="inline-block h-0.5 w-5 rounded" :style="{ backgroundColor: color }" />
          MA{{ period }}
        </span>
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-1">
        <button
          v-if="markers"
          type="button"
          :aria-pressed="showMarkers"
          :class="[
            'mr-2 rounded px-2 py-1 text-xs font-medium transition-colors',
            showMarkers ? 'bg-ink-soft text-ink' : 'text-gray-400 hover:bg-gray-100',
          ]"
          title="在 K 線上標示技術訊號"
          @click="toggleMarkers"
        >
          訊號 {{ showMarkers ? '開' : '關' }}
        </button>
        <button
          v-for="ind in indicators"
          :key="ind.value"
          :class="[
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            indicator === ind.value ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-100',
          ]"
          @click="indicator = ind.value"
        >
          {{ ind.label }}
        </button>
      </div>
    </div>

    <div class="relative">
      <div
        v-if="legend"
        class="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-white/85 px-2.5 py-1.5 font-mono text-xs shadow-sm backdrop-blur"
      >
        <span class="text-gray-400">{{ legend.date }}</span>
        <span>開<b :class="legend.up ? 'text-up' : 'text-down'">{{ legend.open.toFixed(2) }}</b></span>
        <span>高<b class="text-up">{{ legend.high.toFixed(2) }}</b></span>
        <span>低<b class="text-down">{{ legend.low.toFixed(2) }}</b></span>
        <span>收<b :class="legend.up ? 'text-up' : 'text-down'">{{ legend.close.toFixed(2) }}</b></span>
        <span :class="legend.up ? 'text-up' : 'text-down'">
          {{ legend.change >= 0 ? '+' : '' }}{{ legend.change.toFixed(2) }}
          ({{ legend.pct >= 0 ? '+' : '' }}{{ legend.pct.toFixed(2) }}%)
        </span>
        <span class="text-gray-500">量 {{ legend.lots.toLocaleString() }}張</span>
        <span
          v-for="m in legend.marks"
          :key="m.side"
          class="basis-full font-sans"
          :class="m.side === 'bull' ? 'text-up' : 'text-down'"
        >{{ m.side === 'bull' ? '▲' : '▼' }} {{ m.labels.join('、') }}</span>
      </div>
      <div
        ref="chartContainer"
        :style="{ height: `${height}px` }"
        class="w-full overflow-hidden rounded-lg"
      />
    </div>
  </div>
</template>
