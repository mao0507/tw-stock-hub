<script setup lang="ts">
import { watch } from 'vue'
import type { DailyQuote } from '@tw-stock-hub/types'
import { useECharts } from '../composables/useECharts'
import { STOCK_COLORS, BASE_ECHARTS_OPTION } from '../theme/echarts-theme'
import type { ECOption } from '../types'

interface Props {
  data: DailyQuote[]
  height?: number
}

const props = withDefaults(defineProps<Props>(), { height: 100 })

const { chartContainer, setOption, isReady } = useECharts()

function buildOption(): ECOption {
  if (!props.data.length) return {}

  const dates = props.data.map(d => d.date)
  // volume 為股數，台股以「張」(1000 股) 為單位顯示
  const volumes = props.data.map(d => Math.round(d.volume / 1000))
  const isUpList = props.data.map((d, i) => {
    if (i === 0) return true
    return d.close >= (props.data[i - 1]?.close ?? d.close)
  })

  return {
    ...BASE_ECHARTS_OPTION,
    grid: { top: 4, right: 8, bottom: 32, left: 60 },
    xAxis: {
      ...(BASE_ECHARTS_OPTION.xAxis as object),
      data: dates,
    },
    yAxis: {
      ...(BASE_ECHARTS_OPTION.yAxis as object),
      axisLabel: {
        color: STOCK_COLORS.textLight,
        fontSize: 10,
        formatter: (v: number) => {
          if (v >= 1e4) return `${(v / 1e4).toFixed(0)}萬張`
          return `${v}張`
        },
      },
    },
    series: [
      {
        type: 'bar',
        data: volumes.map((v, i) => ({
          value: v,
          itemStyle: {
            color: isUpList[i] ? STOCK_COLORS.upSoft : STOCK_COLORS.downSoft,
            borderColor: isUpList[i] ? STOCK_COLORS.up : STOCK_COLORS.down,
            borderWidth: 1,
          },
        })),
        barMaxWidth: 10,
      },
    ],
    dataZoom: [{ type: 'inside', start: 60, end: 100, minValueSpan: 10 }],
    tooltip: {
      ...(BASE_ECHARTS_OPTION.tooltip as object),
      formatter: (params: unknown) => {
        const p = (params as { dataIndex: number }[])[0]
        if (!p) return ''
        const d = props.data[p.dataIndex]
        if (!d) return ''
        const lots = Math.round(d.volume / 1000)
        const vol = lots >= 1e4
          ? `${(lots / 1e4).toFixed(1)} 萬張`
          : `${lots.toLocaleString()} 張`
        return `<div style="font-size:12px"><div style="color:#aaa">${d.date}</div><div>成交量 <b>${vol}</b></div></div>`
      },
    },
  }
}

watch(isReady, (ready) => { if (ready) setOption(buildOption(), true) })
watch(() => props.data, () => { if (isReady.value) setOption(buildOption(), true) })
</script>

<template>
  <div ref="chartContainer" :style="{ height: `${height}px` }" class="w-full" />
</template>
