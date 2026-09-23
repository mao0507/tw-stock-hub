import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import {
  createChart,
  type IChartApi,
  type ChartOptions,
  type DeepPartial,
} from 'lightweight-charts'
import { STOCK_COLORS } from '../theme/echarts-theme'

const TV_DEFAULT_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: 'transparent' },
    textColor: STOCK_COLORS.text,
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
  },
  grid: {
    vertLines: { color: STOCK_COLORS.grid },
    horzLines: { color: STOCK_COLORS.grid },
  },
  crosshair: { mode: 1 },
  rightPriceScale: {
    borderColor: STOCK_COLORS.grid,
    scaleMargins: { top: 0.1, bottom: 0.1 },
  },
  timeScale: {
    borderColor: STOCK_COLORS.grid,
    timeVisible: false,
    secondsVisible: false,
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
}

interface UseTradingViewChartReturn {
  chartContainer: Ref<HTMLElement | null>
  chart: Ref<IChartApi | null>
  isReady: Ref<boolean>
  resize: () => void
}

export function useTradingViewChart(
  options: DeepPartial<ChartOptions> = {},
): UseTradingViewChartReturn {
  const chartContainer = ref<HTMLElement | null>(null)
  const chart = ref<IChartApi | null>(null)
  const isReady = ref(false)
  let resizeObserver: ResizeObserver | null = null

  function resize(): void {
    if (chart.value && chartContainer.value) {
      const { clientWidth, clientHeight } = chartContainer.value
      if (clientWidth > 0 && clientHeight > 0) {
        chart.value.applyOptions({ width: clientWidth, height: clientHeight })
      }
    }
  }

  onMounted(() => {
    if (!chartContainer.value) return

    chart.value = createChart(chartContainer.value, {
      ...TV_DEFAULT_OPTIONS,
      ...options,
      width: chartContainer.value.clientWidth,
      height: chartContainer.value.clientHeight || 300,
    })

    isReady.value = true

    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(chartContainer.value)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    chart.value?.remove()
    chart.value = null
    isReady.value = false
  })

  return { chartContainer, chart, isReady, resize }
}
