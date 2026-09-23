<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  value: number | null
  showSign?: boolean
  decimals?: number
}

const props = withDefaults(defineProps<Props>(), {
  showSign: true,
  decimals: 2,
})

const formatted = computed(() => {
  if (props.value == null) return '—'
  const sign = props.showSign && props.value > 0 ? '+' : ''
  return `${sign}${props.value.toFixed(props.decimals)}%`
})

const colorClass = computed(() => {
  if (props.value == null) return 'text-gray-400'
  if (props.value > 0) return 'text-up'
  if (props.value < 0) return 'text-down'
  return 'text-gray-500'
})
</script>

<template>
  <span :class="['font-mono tabular-nums text-sm font-medium', colorClass]">
    {{ formatted }}
  </span>
</template>
