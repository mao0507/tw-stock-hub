<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import type { Margin } from '@tw-stock-hub/types'
import { useECharts } from '../composables/useECharts'
import { STOCK_COLORS, BASE_ECHARTS_OPTION, MARGIN_COLORS } from '../theme/echarts-theme'
import type { ECOption } from '../types'

interface Props {
  data: Margin[]
  height?: number
}

const props = withDefaults(defineProps<Props>(), { height: 240 })

const { chartContainer, chartInstance, setOption, isReady } = useECharts()

// hover 資訊列
const hoverIndex = ref<number | null>(null)
const legend = computed(() => {
  if (!props.data.length) return null
  const i = hoverIndex.value ?? props.data.length - 1
  return props.data[i] ?? props.data[props.data.length - 1]
})

function fmtLots(v: number): string {
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(1)}萬`
  return v.toLocaleString()
}
function fmtChange(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toLocaleString()}`
}

function buildOption(): ECOption {
  if (!props.data.length) return {}

  const dates = props.data.map(d => d.date)

  return {
    ...BASE_ECHARTS_OPTION,
    grid: { top: 12, right: 64, bottom: 36, left: 64 },
    xAxis: {
      ...(BASE_ECHARTS_OPTION.xAxis as object),
      data: dates,
      axisLabel: {
        color: STOCK_COLORS.textLight,
        fontSize: 10,
        rotate: dates.length > 15 ? 30 : 0,
      },
    },
    yAxis: [
      {
        ...(BASE_ECHARTS_OPTION.yAxis as object),
        name: '融資(張)',
        nameTextStyle: { color: MARGIN_COLORS.margin, fontSize: 10 },
        axisLabel: {
          color: STOCK_COLORS.textLight,
          fontSize: 10,
          formatter: (v: number) => (v >= 1e4 ? `${(v / 1e4).toFixed(0)}萬` : String(v)),
        },
      },
      {
        type: 'value',
        name: '融券(張)',
        nameTextStyle: { color: MARGIN_COLORS.short, fontSize: 10 },
        position: 'right',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: STOCK_COLORS.textLight, fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '融資餘額',
        type: 'line',
        yAxisIndex: 0,
        data: props.data.map(d => d.marginBalance),
        smooth: true,
        lineStyle: { color: MARGIN_COLORS.margin, width: 2 },
        itemStyle: { color: MARGIN_COLORS.margin },
        symbol: 'none',
        areaStyle: { color: MARGIN_COLORS.increase },
      },
      {
        name: '融券餘額',
        type: 'line',
        yAxisIndex: 1,
        data: props.data.map(d => d.shortBalance),
        smooth: true,
        lineStyle: { color: MARGIN_COLORS.short, width: 2 },
        itemStyle: { color: MARGIN_COLORS.short },
        symbol: 'none',
      },
    ],
    tooltip: {
      ...(BASE_ECHARTS_OPTION.tooltip as object),
      formatter: (params: unknown) => {
        const ps = params as { dataIndex: number }[]
        if (!ps.length) return ''
        const d = props.data[ps[0]!.dataIndex]
        if (!d) return ''
        return `<div style="font-size:12px">
          <div style="color:#aaa;margin-bottom:4px">${d.date}</div>
          <div>融資餘額：<b style="color:${MARGIN_COLORS.margin}">${fmtLots(d.marginBalance)} 張</b></div>
          <div>融券餘額：<b style="color:${MARGIN_COLORS.short}">${fmtLots(d.shortBalance)} 張</b></div>
        </div>`
      },
    },
  }
}

function bindHover(): void {
  const zr = chartInstance.value?.getZr()
  zr?.on('mousemove', (e: { offsetX: number; offsetY: number }) => {
    const inst = chartInstance.value
    if (!inst) return
    const p = inst.convertFromPixel({ seriesIndex: 0 }, [e.offsetX, e.offsetY]) as number[]
    const idx = Math.round(p?.[0] ?? -1)
    hoverIndex.value = idx >= 0 && idx < props.data.length ? idx : null
  })
  zr?.on('mouseout', () => { hoverIndex.value = null })
}

watch(isReady, ready => { if (ready) { setOption(buildOption(), true); bindHover() } })
watch(() => props.data, () => { if (isReady.value) setOption(buildOption(), true) })
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- hover 資訊列 -->
    <div
      v-if="legend"
      class="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 font-mono text-xs"
    >
      <span class="text-gray-400">{{ legend.date }}</span>
      <span>融資 <b :style="{ color: MARGIN_COLORS.margin }">{{ fmtLots(legend.marginBalance) }}張</b></span>
      <span :class="legend.marginChange >= 0 ? 'text-up' : 'text-down'">({{ fmtChange(legend.marginChange) }})</span>
      <span>融券 <b :style="{ color: MARGIN_COLORS.short }">{{ fmtLots(legend.shortBalance) }}張</b></span>
      <span :class="legend.shortChange >= 0 ? 'text-up' : 'text-down'">({{ fmtChange(legend.shortChange) }})</span>
      <span v-if="legend.ratio != null" class="text-gray-500">券資比 {{ legend.ratio.toFixed(2) }}%</span>
    </div>

    <div ref="chartContainer" :style="{ height: `${height}px` }" class="w-full" />
  </div>
</template>
