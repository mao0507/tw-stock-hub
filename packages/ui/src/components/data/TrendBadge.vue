<script setup lang="ts">
interface Props {
  days: number
  direction: 'buy' | 'sell'
  size?: 'sm' | 'md'
}

withDefaults(defineProps<Props>(), { size: 'md' })
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1 rounded-full font-semibold',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs',
      direction === 'buy' ? 'bg-up-soft text-up' : 'bg-down-soft text-down',
    ]"
  >
    <span>{{ direction === 'buy' ? '▲' : '▼' }}</span>
    <span>連{{ direction === 'buy' ? '買' : '賣' }} {{ days }} 日</span>
  </span>
</template>
