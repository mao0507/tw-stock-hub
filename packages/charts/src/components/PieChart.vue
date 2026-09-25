<script setup lang="ts">
import { watch } from 'vue'
import { useECharts } from '../composables/useECharts'
import { STOCK_COLORS, PIE_PALETTE } from '../theme/echarts-theme'
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


function buildOption(): ECOption {
  if (!props.data.length) return {}
  const top = props.data[0]
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(29,36,32,0.94)',
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
        radius: ['62%', '88%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        padAngle: 1.5,
        itemStyle: { borderColor: '#fffdf8', borderWidth: 2, borderRadius: 4 },
        // ponytail: 外圈標籤在窄版會被截斷，圖例改由使用端以 HTML 呈現
        label: { show: false },
        emphasis: {
          scaleSize: 6,
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.15)' },
        },
        data: props.data.map((d, i) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: PIE_PALETTE[i % PIE_PALETTE.length] },
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
