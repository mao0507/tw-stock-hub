<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  volume: number
  maxVolume: number
  isUp?: boolean
  showLabel?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isUp: true,
  showLabel: false,
})

const pct = computed(() =>
  props.maxVolume > 0
    ? Math.min((props.volume / props.maxVolume) * 100, 100)
    : 0
)

function fmt(v: number): string {
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)}萬`
  return v.toLocaleString()
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
      <div
        :class="['h-full rounded-full transition-all', isUp ? 'bg-up/60' : 'bg-down/60']"
        :style="{ width: `${pct}%` }"
      />
    </div>
    <span v-if="showLabel" class="w-14 text-right font-mono text-xs text-gray-400">
      {{ fmt(volume) }}
    </span>
  </div>
</template>
