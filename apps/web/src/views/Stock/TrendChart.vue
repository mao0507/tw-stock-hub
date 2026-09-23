<script setup lang="ts">
// 通用多序列折線圖（三率趨勢 / PE 歷史 / 大戶持股趨勢共用）
import { watch } from 'vue'
import { useECharts, BASE_ECHARTS_OPTION, STOCK_COLORS } from '@tw-stock-hub/charts'
import type { ECOption } from '@tw-stock-hub/charts'

export interface TrendSeries {
  name: string
  color: string
  data: { date: string; value: number | null }[]
}

const props = withDefaults(defineProps<{
  series: TrendSeries[]
  height?: number
  unit?: string
}>(), {
  height: 220,
  unit: '',
})

const { chartContainer, setOption, isReady } = useECharts()

function buildOption(): ECOption {
  const first = props.series[0]
  if (!first?.data.length) return {}
  const dates = first.data.map(d => d.date)

  return {
    ...BASE_ECHARTS_OPTION,
    grid: { top: 28, right: 16, bottom: 28, left: 48 },
    legend: props.series.length > 1
      ? { top: 0, left: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: STOCK_COLORS.textLight, fontSize: 12 } }
      : undefined,
    xAxis: {
      ...(BASE_ECHARTS_OPTION.xAxis as object),
      data: dates,
      boundaryGap: false,
      axisLabel: {
        color: STOCK_COLORS.textLight,
        fontSize: 11,
        interval: Math.max(0, Math.floor(dates.length / 5) - 1),
      },
    },
    yAxis: {
      ...(BASE_ECHARTS_OPTION.yAxis as object),
      scale: true,
      splitNumber: 4,
      axisLabel: {
        color: STOCK_COLORS.textLight,
        fontSize: 11,
        formatter: (v: number) => `${v}${props.unit}`,
      },
    },
    tooltip: {
      ...(BASE_ECHARTS_OPTION.tooltip as object),
      trigger: 'axis',
      valueFormatter: (v: unknown) => (v == null ? '—' : `${Number(v).toFixed(2)}${props.unit}`),
    },
    series: props.series.map(s => ({
      name: s.name,
      type: 'line' as const,
      data: s.data.map(d => d.value),
      smooth: 0.3,
      symbol: 'none',
      connectNulls: true,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
    })),
  }
}

watch(isReady, ready => { if (ready) setOption(buildOption(), true) })
watch(() => props.series, () => { if (isReady.value) setOption(buildOption(), true) }, { deep: true })
</script>

<template>
  <div
    ref="chartContainer"
    :style="{ height: `${height}px` }"
    class="w-full"
  />
</template>
