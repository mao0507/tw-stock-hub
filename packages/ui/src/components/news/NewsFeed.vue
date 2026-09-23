<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { NewsItem, NewsSource, NewsCategory } from '@tw-stock-hub/types'
import { stockApi } from '@tw-stock-hub/api-client'
import NewsCard from './NewsCard.vue'
import LoadingSkeleton from '../feedback/LoadingSkeleton.vue'
import EmptyState from '../feedback/EmptyState.vue'

interface Props {
  stockId?: string
  source?: NewsSource
  category?: NewsCategory
  pageSize?: number
}

const props = withDefaults(defineProps<Props>(), { pageSize: 20 })

const items = ref<NewsItem[]>([])
const page = ref(1)
const totalPages = ref(1)
const loading = ref(false)
const loadingMore = ref(false)

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function loadNews(reset = false): Promise<void> {
  if (reset) {
    page.value = 1
    items.value = []
    totalPages.value = 1
  }

  if (loading.value || loadingMore.value) return
  reset ? (loading.value = true) : (loadingMore.value = true)

  try {
    const params = {
      page: page.value,
      limit: props.pageSize,
      ...(props.source ? { source: props.source } : {}),
      ...(props.category ? { category: props.category } : {}),
    }

    const res = props.stockId
      ? await stockApi.getStockNews(props.stockId, params)
      : await stockApi.getLatestNews(params)

    items.value = reset ? res.items : [...items.value, ...res.items]
    totalPages.value = res.totalPages
    page.value++
  } catch (e) {
    console.warn('[NewsFeed] load failed', e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

onMounted(() => {
  loadNews(true)

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && page.value <= totalPages.value && !loadingMore.value) {
        loadNews()
      }
    },
    { threshold: 0.1 },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => observer?.disconnect())

watch([() => props.stockId, () => props.source, () => props.category], () => loadNews(true))
</script>

<template>
  <div>
    <LoadingSkeleton v-if="loading" type="list" :rows="5" />

    <EmptyState
      v-else-if="!loading && items.length === 0"
      title="目前沒有相關新聞"
      icon="news"
    />

    <template v-else>
      <div class="divide-y divide-gray-50">
        <NewsCard v-for="item in items" :key="item.id" :news="item" />
      </div>

      <div v-if="loadingMore" class="px-3 py-4">
        <LoadingSkeleton type="list" :rows="3" />
      </div>

      <p v-else-if="page > totalPages" class="py-6 text-center text-xs text-gray-300">
        已顯示全部新聞
      </p>
    </template>

    <div ref="sentinel" class="h-1" />
  </div>
</template>
