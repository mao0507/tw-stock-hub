export { useTradingViewChart } from './composables/useTradingViewChart'
export { useECharts } from './composables/useECharts'
export { STOCK_COLORS, BASE_ECHARTS_OPTION, INSTITUTIONAL_COLORS, MARGIN_COLORS, PIE_PALETTE } from './theme/echarts-theme'
export type { ECOption } from './types'

export { default as KLineChart } from './components/KLineChart.vue'
export { default as VolumeChart } from './components/VolumeChart.vue'
export { default as InstitutionalChart } from './components/InstitutionalChart.vue'
export { default as MarginChart } from './components/MarginChart.vue'
export { default as IndexLineChart } from './components/IndexLineChart.vue'
export { default as HeatmapChart } from './components/HeatmapChart.vue'
export { default as PieChart } from './components/PieChart.vue'
export { assignMarkers, type ChartMarker } from './utils/markers'
export {
  DEFAULT_INDICATOR_PARAMS, INDICATOR_PARAM_SPECS, withDefaults as withIndicatorDefaults,
  type IndicatorKey, type IndicatorParams, type PartialIndicatorParams,
} from './utils/indicator-params'
export type { ChartDrawing, DrawingKind, DrawingPoint } from './utils/drawings'
