<script setup lang="ts">
// 月營收：長條（億）+ 年增率折線（%）雙軸，財報狗式
import { watch } from 'vue'
import { useECharts, BASE_ECHARTS_OPTION, STOCK_COLORS } from '@tw-stock-hub/charts'
import type { ECOption } from '@tw-stock-hub/charts'
import type { RevenueItem } from '@tw-stock-hub/types'

const props = withDefaults(defineProps<{
  data: RevenueItem[]
  height?: number
}>(), {
  height: 260,
})

const { chartContainer, setOption, isReady } = useECharts()

function fmtYM(ym: string): string {
  return `${ym.slice(0, 3)}/${ym.slice(3)}`
}

function buildOption(): ECOption {
  if (!props.data.length) return {}
  const labels = props.data.map(r => fmtYM(r.yearMonth))
  const revenues = props.data.map(r => (r.revenue != null ? Math.round(r.revenue / 1e4) / 10 : null)) // 千元 → 億
  const yoy = props.data.map(r => r.yoyPct)

  return {
    ...BASE_ECHARTS_OPTION,
    grid: { top: 30, right: 52, bottom: 28, left: 52 },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: STOCK_COLORS.textLight, fontSize: 12 },
    },
    xAxis: {
      ...(BASE_ECHARTS_OPTION.xAxis as object),
      data: labels,
      axisLabel: {
        color: STOCK_COLORS.textLight,
        fontSize: 11,
        interval: Math.max(0, Math.ceil(labels.length / 12) - 1),
      },
    },
    yAxis: [
      {
        ...(BASE_ECHARTS_OPTION.yAxis as object),
        name: '億',
        nameTextStyle: { color: STOCK_COLORS.textLight, fontSize: 11 },
        axisLabel: {
          color: STOCK_COLORS.textLight,
          fontSize: 11,
          formatter: (v: number) => v.toLocaleString(),
        },
      },
      {
        type: 'value' as const,
        name: '%',
        nameTextStyle: { color: STOCK_COLORS.textLight, fontSize: 11 },
        splitLine: { show: false },
        axisLabel: { color: STOCK_COLORS.textLight, fontSize: 11, formatter: '{value}%' },
      },
    ],
    series: [
      {
        name: '月營收',
        type: 'bar' as const,
        data: revenues,
        barWidth: '58%',
        itemStyle: { color: 'rgba(106, 169, 240, 0.75)', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '年增率',
        type: 'line' as const,
        yAxisIndex: 1,
        data: yoy,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: true,
        lineStyle: { color: '#d97706', width: 2 },
        itemStyle: { color: '#d97706' },
      },
    ],
    tooltip: {
      ...(BASE_ECHARTS_OPTION.tooltip as object),
      trigger: 'axis',
      formatter: (params: unknown) => {
        const ps = params as { dataIndex: number }[]
        if (!ps.length) return ''
        const r = props.data[ps[0]!.dataIndex]
        if (!r) return ''
        const pct = (v: number | null): string => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`)
        const yoyClr = (r.yoyPct ?? 0) >= 0 ? STOCK_COLORS.up : STOCK_COLORS.down
        const momClr = (r.momPct ?? 0) >= 0 ? STOCK_COLORS.up : STOCK_COLORS.down
        return `<div style="font-size:13px;line-height:1.7">
          <div style="color:#9ca3af;font-size:12px;margin-bottom:2px">${fmtYM(r.yearMonth)}</div>
          <div>營收 <b style="font-size:14px">${r.revenue != null ? (r.revenue / 1e5).toFixed(1) : '—'} 億</b></div>
          <div>年增 <b style="color:${yoyClr}">${pct(r.yoyPct)}</b> · 月增 <b style="color:${momClr}">${pct(r.momPct)}</b></div>
        </div>`
      },
    },
  }
}

watch(isReady, ready => { if (ready) setOption(buildOption(), true) })
watch(() => props.data, () => { if (isReady.value) setOption(buildOption(), true) }, { deep: true })
</script>

<template>
  <div
    ref="chartContainer"
    :style="{ height: `${height}px` }"
    class="w-full"
  />
</template>
