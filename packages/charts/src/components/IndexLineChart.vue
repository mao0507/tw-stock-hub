<script setup lang="ts">
import { watch } from 'vue'
import type { MarketHistoryItem } from '@tw-stock-hub/types'
import { useECharts } from '../composables/useECharts'
import { STOCK_COLORS, BASE_ECHARTS_OPTION } from '../theme/echarts-theme'
import type { ECOption } from '../types'

type Period = '1M' | '3M' | '6M' | '1Y'

interface Props {
  data: MarketHistoryItem[]
  period?: Period
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  period: '3M',
  height: 260,
})

const emit = defineEmits<{ 'period-change': [period: Period] }>()

const periods: { value: Period; label: string }[] = [
  { value: '1M', label: '1個月' },
  { value: '3M', label: '3個月' },
  { value: '6M', label: '6個月' },
  { value: '1Y', label: '1年' },
]

const { chartContainer, setOption, isReady } = useECharts()

function buildOption(): ECOption {
  if (!props.data.length) return {}

  const dates = props.data.map(d => d.date)
  const closes = props.data.map(d => d.close)
  const first = closes[0] ?? 0
  const last = closes[closes.length - 1] ?? 0
  const isUp = last >= first
  const lineColor = isUp ? STOCK_COLORS.up : STOCK_COLORS.down
  const areaTop = isUp ? 'rgba(230,57,80,0.15)' : 'rgba(16,183,122,0.15)'

  return {
    ...BASE_ECHARTS_OPTION,
    grid: { top: 16, right: 20, bottom: 36, left: 76 },
    xAxis: {
      ...(BASE_ECHARTS_OPTION.xAxis as object),
      data: dates,
      boundaryGap: false,
      axisLabel: {
        color: STOCK_COLORS.textLight,
        fontSize: 13,
        showMaxLabel: true,
        showMinLabel: true,
        interval: Math.floor(dates.length / 4),
      },
    },
    yAxis: {
      ...(BASE_ECHARTS_OPTION.yAxis as object),
      min: (v: { min: number }) => Math.floor(v.min * 0.998),
      max: (v: { max: number }) => Math.ceil(v.max * 1.002),
      splitNumber: 4,
      axisLabel: {
        color: STOCK_COLORS.textLight,
        fontSize: 13,
        formatter: (v: number) => v.toLocaleString(),
      },
    },
    series: [
      {
        type: 'line',
        data: closes,
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: (_, params: { dataIndex: number }) =>
          params.dataIndex === closes.length - 1 ? 6 : 0,
        lineStyle: { color: lineColor, width: 2.5 },
        itemStyle: { color: lineColor, borderWidth: 2, borderColor: '#fff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: areaTop },
              { offset: 1, color: 'rgba(255,255,255,0)' },
            ],
          },
        },
      },
    ],
    tooltip: {
      ...(BASE_ECHARTS_OPTION.tooltip as object),
      formatter: (params: unknown) => {
        const ps = params as { dataIndex: number; value: number }[]
        if (!ps.length) return ''
        const d = props.data[ps[0]!.dataIndex]
        if (!d) return ''
        const clr = d.changePct >= 0 ? STOCK_COLORS.up : STOCK_COLORS.down
        const sign = d.changePct >= 0 ? '+' : ''
        return `<div style="font-size:13px;line-height:1.6">
          <div style="color:#9ca3af;font-size:12px;margin-bottom:2px">${d.date}</div>
          <div>收盤 <b style="font-size:15px">${d.close.toLocaleString()}</b></div>
          <div style="color:${clr}">${sign}${d.change.toFixed(2)} (${sign}${d.changePct?.toFixed(2)}%)</div>
        </div>`
      },
    },
  }
}

watch(isReady, ready => { if (ready) setOption(buildOption(), true) })
watch(() => props.data, () => { if (isReady.value) setOption(buildOption(), true) })
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-1">
      <button
        v-for="p in periods"
        :key="p.value"
        :class="[
          'rounded px-3 py-1 text-sm font-medium transition-colors',
          period === p.value ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-100',
        ]"
        @click="emit('period-change', p.value)"
      >
        {{ p.label }}
      </button>
    </div>

    <div ref="chartContainer" :style="{ height: `${height}px` }" class="w-full" />
  </div>
</template>
