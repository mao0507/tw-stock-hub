<script setup lang="ts">
import IconSearch from '~icons/lucide/search'
import IconChart from '~icons/lucide/chart-column'
import IconStar from '~icons/lucide/star'
import IconNews from '~icons/lucide/newspaper'
import IconFilter from '~icons/lucide/funnel'

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
  search: IconSearch,
  chart: IconChart,
  star: IconStar,
  news: IconNews,
  filter: IconFilter,
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <component
      :is="icons[icon ?? 'chart']"
      class="text-4xl text-gray-300"
      aria-hidden="true"
    />
    <div>
      <p class="text-sm font-medium text-gray-600">{{ title }}</p>
      <p v-if="description" class="mt-1 text-xs text-gray-400">{{ description }}</p>
    </div>
    <slot name="action" />
  </div>
</template>
