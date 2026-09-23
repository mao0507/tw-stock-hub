<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '../../lib/utils'

interface Props {
  price: number
  change?: number
  changePct?: number | null
  size?: 'sm' | 'md' | 'lg'
  showArrow?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showArrow: true,
})

const direction = computed(() => {
  if (!props.changePct && props.changePct !== 0) return 'flat'
  if (props.changePct > 0) return 'up'
  if (props.changePct < 0) return 'down'
  return 'flat'
})

const colorClass = computed(() => ({
  up: 'text-up', down: 'text-down', flat: 'text-gray-500',
}[direction.value]))

const badgeClass = computed(() => ({
  up: 'bg-up-soft text-up', down: 'bg-down-soft text-down', flat: 'bg-gray-100 text-gray-500',
}[direction.value]))

const arrow = computed(() => ({ up: '▲', down: '▼', flat: '—' }[direction.value]))

const priceSize = computed(() => ({
  sm: 'text-base font-medium',
  md: 'text-xl font-semibold',
  lg: 'text-3xl font-bold',
}[props.size]))

const formattedPct = computed(() => {
  if (props.changePct == null) return null
  const sign = props.changePct >= 0 ? '+' : ''
  return `${sign}${props.changePct.toFixed(2)}%`
})
</script>

<template>
  <div class="inline-flex items-baseline gap-2">
    <span :class="[priceSize, 'font-mono tabular-nums', colorClass]">
      {{ price.toFixed(2) }}
    </span>
    <span
      v-if="formattedPct"
      :class="['inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold', badgeClass]"
    >
      <span v-if="showArrow">{{ arrow }}</span>
      {{ formattedPct }}
    </span>
  </div>
</template>
