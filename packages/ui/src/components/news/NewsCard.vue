<script setup lang="ts">
import { computed } from 'vue'
import type { NewsItem } from '@tw-stock-hub/types'
import { NEWS_SOURCE_LABEL } from '@tw-stock-hub/types'
import MopsAnnouncementTag from './MopsAnnouncementTag.vue'

interface Props {
  news: NewsItem
}

const props = defineProps<Props>()

// 來源 published_at 為台北時間，但 DB 以 UTC 標記（差 +8）。
// 直接取 UTC 時鐘元件還原台北時間，並顯示絕對時間（非相對「剛剛」）。
const displayTime = computed(() => {
  const d = new Date(props.news.publishedAt)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
})

const sourceLabel = computed(() =>
  NEWS_SOURCE_LABEL[props.news.source] ?? props.news.source
)
</script>

<template>
  <a
    :href="news.url"
    target="_blank"
    rel="noopener noreferrer"
    class="block rounded-lg p-3.5 transition-colors hover:bg-gray-50"
  >
    <div class="mb-1.5 flex items-center gap-2">
      <MopsAnnouncementTag :category="news.category" />
      <span class="text-xs text-gray-400">{{ sourceLabel }}</span>
      <span class="ml-auto font-mono text-xs text-gray-400">{{ displayTime }}</span>
    </div>
    <p class="line-clamp-2 text-sm font-medium leading-snug text-gray-800 hover:text-up">
      {{ news.title }}
    </p>
    <p v-if="news.summary" class="mt-1 line-clamp-1 text-xs text-gray-400">
      {{ news.summary }}
    </p>
  </a>
</template>
