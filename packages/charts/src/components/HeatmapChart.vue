<script setup lang="ts">
import { watch } from 'vue'
import type { SectorHeatmapItem } from '@tw-stock-hub/types'
import { useECharts } from '../composables/useECharts'
import { STOCK_COLORS } from '../theme/echarts-theme'
import type { ECOption } from '../types'

interface Props {
  data: SectorHeatmapItem[]
  height?: number
}

const props = withDefaults(defineProps<Props>(), { height: 240 })

const emit = defineEmits<{ select: [sectorName: string] }>()

const { chartContainer, chartInstance, setOption, isReady } = useECharts()

function changePctToColor(pct: number): string {
  if (pct >= 3) return '#D32F2F'
  if (pct >= 1.5) return STOCK_COLORS.up
  if (pct >= 0.5) return '#EF9A9A'
  if (pct > -0.5) return '#E0E0E0'
  if (pct > -1.5) return '#80CBC4'
  if (pct > -3) return STOCK_COLORS.down
  return '#00695C'
}

function textColor(pct: number): string {
  if (Math.abs(pct) >= 1.5) return '#FFFFFF'
  return STOCK_COLORS.text
}

function buildOption(): ECOption {
  if (!props.data.length) return {}

  const treeData = props.data.map(d => ({
    name: d.sectorName,
    value: d.value || 1,
    changePct: d.changePct,
    itemStyle: {
      color: changePctToColor(d.changePct),
    },
    label: {
      color: textColor(d.changePct),
    },
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1C2833',
      borderColor: 'transparent',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: unknown) => {
        const p = params as { data: { name: string; changePct: number; value: number } }
        const { name, changePct } = p.data
        const sign = changePct >= 0 ? '+' : ''
        return `<div style="font-size:12px">
          <b>${name}</b><br/>
          漲跌幅：<span style="color:${changePct >= 0 ? STOCK_COLORS.up : STOCK_COLORS.down}">${sign}${changePct.toFixed(2)}%</span>
        </div>`
      },
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%',
        height: '100%',
        data: treeData,
        label: {
          show: true,
          formatter: (params: unknown) => {
            const p = params as { data: { name: string; changePct: number } }
            const sign = p.data.changePct >= 0 ? '+' : ''
            return `{name|${p.data.name}}\n{pct|${sign}${p.data.changePct.toFixed(2)}%}`
          },
          rich: {
            name: { fontSize: 12, fontWeight: 600, lineHeight: 18 },
            pct: { fontSize: 11, lineHeight: 16 },
          },
        },
        itemStyle: { gapWidth: 2, borderWidth: 0 },
        levels: [{ itemStyle: { gapWidth: 3 }, upperLabel: { show: false } }],
      },
    ],
  }
}

watch(isReady, ready => {
  if (!ready) return
  setOption(buildOption(), true)
  chartInstance.value?.on('click', (params: unknown) => {
    const p = params as { data?: { name?: string } }
    if (p.data?.name) emit('select', p.data.name)
  })
})
watch(() => props.data, () => { if (isReady.value) setOption(buildOption(), true) })
</script>

<template>
  <div ref="chartContainer" :style="{ height: `${height}px` }" class="w-full" />
</template>
