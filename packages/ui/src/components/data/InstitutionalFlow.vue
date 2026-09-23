<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  foreignNet: number
  trustNet: number
  dealerNet: number
  showBars?: boolean
}

const props = withDefaults(defineProps<Props>(), { showBars: true })

const items = computed(() => [
  { label: '外資', value: props.foreignNet },
  { label: '投信', value: props.trustNet },
  { label: '自營', value: props.dealerNet },
])

const maxAbs = computed(() =>
  Math.max(...items.value.map(i => Math.abs(i.value)), 1)
)

function fmt(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}億`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}萬`
  return `${sign}${abs.toLocaleString()}`
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="item in items" :key="item.label" class="flex items-center gap-2">
      <span class="w-8 text-right text-xs text-gray-500">{{ item.label }}</span>
      <div v-if="showBars" class="flex h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          :class="['h-full rounded-full transition-all', item.value >= 0 ? 'bg-up ml-auto' : 'bg-down']"
          :style="{ width: `${(Math.abs(item.value) / maxAbs) * 100}%` }"
        />
      </div>
      <span
        :class="['w-20 text-right font-mono text-xs font-semibold tabular-nums', item.value >= 0 ? 'text-up' : 'text-down']"
      >
        {{ fmt(item.value) }}
      </span>
    </div>
  </div>
</template>
