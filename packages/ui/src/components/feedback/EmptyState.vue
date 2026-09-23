<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  icon?: 'search' | 'chart' | 'star' | 'news' | 'filter'
}

withDefaults(defineProps<Props>(), {
  title: '目前沒有資料',
  icon: 'chart',
})

const icons = {
  search: '🔍',
  chart: '📊',
  star: '⭐',
  news: '📰',
  filter: '🔭',
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <div class="text-4xl">{{ icons[icon ?? 'chart'] }}</div>
    <div>
      <p class="text-sm font-medium text-gray-600">{{ title }}</p>
      <p v-if="description" class="mt-1 text-xs text-gray-400">{{ description }}</p>
    </div>
    <slot name="action" />
  </div>
</template>
