import type {
  BarSeriesOption, LineSeriesOption,
  CandlestickSeriesOption, HeatmapSeriesOption, TreemapSeriesOption,
} from 'echarts/charts'
import type {
  GridComponentOption, TooltipComponentOption,
  LegendComponentOption, DataZoomComponentOption,
  VisualMapComponentOption,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'

export type ECOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | CandlestickSeriesOption
  | HeatmapSeriesOption
  | TreemapSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | VisualMapComponentOption
>
