<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import type { Institutional } from '@tw-stock-hub/types'
import { useECharts } from '../composables/useECharts'
import { STOCK_COLORS, BASE_ECHARTS_OPTION, INSTITUTIONAL_COLORS } from '../theme/echarts-theme'
import type { ECOption } from '../types'

type InstType = 'foreign' | 'trust' | 'dealer' | 'total'

interface Props {
  data: Institutional[]
  type?: InstType
  height?: number
  showCumulative?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'foreign',
  height: 240,
  showCumulative: true,
})

defineEmits<{ 'update:type': [key: InstType] }>()

const typeLabels: Record<InstType, string> = {
  foreign: '外資',
  trust: '投信',
  dealer: '自營商',
  total: '三大合計',
}

const { chartContainer, chartInstance, setOption, isReady } = useECharts()

// 法人 net 為股數，台股以「張」(1000 股) 顯示
const netValues = computed(() => {
  return props.data.map(d => {
    const val = {
      foreign: d.foreignNet,
      trust: d.trustNet,
      dealer: d.dealerNet,
      total: d.totalNet,
    }[props.type]
    return Math.round((val ?? 0) / 1000)
  })
})

// 累計（單位：萬張）
const cumulativeValues = computed(() => {
  let sum = 0
  return netValues.value.map(v => {
    sum += v
    return parseFloat((sum / 1e4).toFixed(2))
  })
})

// hover 資訊列
const hoverIndex = ref<number | null>(null)
const legend = computed(() => {
  if (!props.data.length) return null
  const i = hoverIndex.value ?? props.data.length - 1
  const d = props.data[i] ?? props.data[props.data.length - 1]
  if (!d) return null
  return { date: d.date, lots: netValues.value[i] ?? 0, cum: cumulativeValues.value[i] ?? 0 }
})

// v 單位為張
function fmt(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}萬張`
  return `${v >= 0 ? '+' : ''}${v.toLocaleString()}張`
}

function buildOption(): ECOption {
  if (!props.data.length) return {}

  const dates = props.data.map(d => d.date)
  const nets = netValues.value
  const cumulative = cumulativeValues.value

  return {
    ...BASE_ECHARTS_OPTION,
    grid: { top: 12, right: 44, bottom: 36, left: 64 },
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
        name: '張',
        nameTextStyle: { color: STOCK_COLORS.textLight, fontSize: 10 },
        axisLabel: {
          color: STOCK_COLORS.textLight,
          fontSize: 10,
          formatter: (v: number) => {
            if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}萬`
            return String(v)
          },
        },
      },
      {
        type: 'value',
        name: '累計(萬張)',
        nameTextStyle: { color: STOCK_COLORS.blue, fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: STOCK_COLORS.blue,
          fontSize: 10,
          formatter: (v: number) => `${v.toFixed(0)}`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: typeLabels[props.type],
        type: 'bar',
        yAxisIndex: 0,
        data: nets.map(v => ({
          value: v,
          itemStyle: {
            color: v >= 0 ? INSTITUTIONAL_COLORS.buy : INSTITUTIONAL_COLORS.sell,
            opacity: 0.85,
          },
        })),
        barMaxWidth: 12,
        emphasis: { itemStyle: { opacity: 1 } },
      },
      ...(props.showCumulative
        ? [{
            name: '累計買超',
            type: 'line' as const,
            yAxisIndex: 1,
            data: cumulative,
            smooth: true,
            lineStyle: { color: INSTITUTIONAL_COLORS.cumulative, width: 1.5 },
            itemStyle: { color: INSTITUTIONAL_COLORS.cumulative },
            symbol: 'none',
          }]
        : []),
    ],
    tooltip: {
      ...(BASE_ECHARTS_OPTION.tooltip as object),
      formatter: (params: unknown) => {
        const ps = params as { dataIndex: number; seriesName: string; value: number }[]
        if (!ps.length) return ''
        const d = props.data[ps[0]!.dataIndex]
        if (!d) return ''
        return `<div style="font-size:12px">
          <div style="color:#aaa;margin-bottom:4px">${d.date}</div>
          ${ps.map(p => {
            const txt = p.seriesName === '累計買超'
              ? `${p.value >= 0 ? '+' : ''}${p.value.toFixed(1)}萬張`
              : fmt(p.value)
            return `<div>${p.seriesName}：<b>${txt}</b></div>`
          }).join('')}
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
watch([() => props.data, () => props.type], () => {
  if (isReady.value) setOption(buildOption(), true)
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1">
      <button
        v-for="(label, key) in typeLabels"
        :key="key"
        :class="[
          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
          type === key ? 'bg-up text-white' : 'text-gray-500 hover:bg-gray-100',
        ]"
        @click="$emit('update:type', key as InstType)"
      >
        {{ label }}
      </button>
    </div>

    <div
      v-if="legend"
      class="flex flex-wrap items-center gap-x-3 px-1 font-mono text-xs"
    >
      <span class="text-gray-400">{{ legend.date }}</span>
      <span>{{ typeLabels[type] }} <b :class="legend.lots >= 0 ? 'text-up' : 'text-down'">{{ fmt(legend.lots) }}</b></span>
      <span v-if="showCumulative" class="text-gray-500">
        累計 <b :class="legend.cum >= 0 ? 'text-up' : 'text-down'">{{ legend.cum >= 0 ? '+' : '' }}{{ legend.cum.toFixed(1) }}萬張</b>
      </span>
    </div>

    <div ref="chartContainer" :style="{ height: `${height}px` }" class="w-full" />
  </div>
</template>
