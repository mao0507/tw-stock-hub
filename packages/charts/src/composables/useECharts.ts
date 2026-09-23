import { ref, shallowRef, onMounted, onUnmounted, type Ref, type ShallowRef } from 'vue'
import * as echarts from 'echarts/core'
import {
  BarChart, LineChart, CandlestickChart, HeatmapChart, TreemapChart, PieChart,
} from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, MarkLineComponent, MarkPointComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECOption } from '../types'

echarts.use([
  BarChart, LineChart, CandlestickChart, HeatmapChart, TreemapChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, MarkLineComponent, MarkPointComponent,
  VisualMapComponent,
  CanvasRenderer,
])

type EChartsInstance = ReturnType<typeof echarts.init>

interface UseEChartsReturn {
  chartContainer: Ref<HTMLElement | null>
  chartInstance: ShallowRef<EChartsInstance | null>
  setOption: (option: ECOption, notMerge?: boolean) => void
  resize: () => void
  isReady: Ref<boolean>
}

export function useECharts(): UseEChartsReturn {
  const chartContainer = ref<HTMLElement | null>(null)
  const chartInstance = shallowRef<EChartsInstance | null>(null)
  const isReady = ref(false)
  let resizeObserver: ResizeObserver | null = null

  function setOption(option: ECOption, notMerge = false): void {
    chartInstance.value?.setOption(option, notMerge)
  }

  function resize(): void {
    chartInstance.value?.resize()
  }

  onMounted(() => {
    if (!chartContainer.value) return

    chartInstance.value = echarts.init(chartContainer.value, null, {
      renderer: 'canvas',
      useDirtyRect: true,
    })
    isReady.value = true

    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(chartContainer.value)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    chartInstance.value?.dispose()
    chartInstance.value = null
    isReady.value = false
  })

  return { chartContainer, chartInstance, setOption, resize, isReady }
}
