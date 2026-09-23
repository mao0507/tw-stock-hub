<script setup lang="ts">
import { watch } from 'vue'
import { useECharts } from '../composables/useECharts'
import { STOCK_COLORS } from '../theme/echarts-theme'
import type { ECOption } from '../types'

interface Slice {
  name: string
  value: number
}

interface Props {
  data: Slice[]
  height?: number
}

const props = withDefaults(defineProps<Props>(), { height: 240 })

const { chartContainer, setOption, isReady } = useECharts()

const PALETTE = [
  '#6aa9f0', '#7c6df0', '#e8893f', '#e9c84a', '#4f9ef0',
  '#34c79a', '#ef6a7d', '#a78bfa', '#2dd4bf', '#f9a8c4', '#b0bac9',
]

function buildOption(): ECOption {
  if (!props.data.length) return {}
  const top = props.data[0]
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(28,40,51,0.92)',
      borderColor: 'transparent',
      borderRadius: 8,
      padding: [6, 10],
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (p: unknown) => {
        const x = p as { name: string; value: number }
        return `${x.name}　<b style="font-size:13px">${x.value.toFixed(2)}%</b>`
      },
    },
    title: top
      ? {
          text: `${top.value.toFixed(1)}%`,
          subtext: top.name,
          left: 'center',
          top: '38%',
          textStyle: { fontSize: 22, fontWeight: 700, color: STOCK_COLORS.text },
          subtextStyle: { fontSize: 11, color: STOCK_COLORS.textLight },
        }
      : undefined,
    series: [
      {
        type: 'pie',
        radius: ['58%', '82%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        padAngle: 1.5,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: {
          show: true,
          formatter: (p: { name: string; percent: number }) =>
            p.percent >= 4 ? `${p.name}` : '',
          fontSize: 11,
          color: STOCK_COLORS.text,
        },
        labelLine: { length: 6, length2: 10, smooth: true },
        emphasis: {
          scaleSize: 6,
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.15)' },
        },
        data: props.data.map((d, i) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: PALETTE[i % PALETTE.length] },
        })),
      },
    ],
  } as unknown as ECOption
}

watch(isReady, ready => { if (ready) setOption(buildOption(), true) })
watch(() => props.data, () => { if (isReady.value) setOption(buildOption(), true) })
</script>

<template>
  <div ref="chartContainer" :style="{ height: `${height}px` }" class="w-full" />
</template>
