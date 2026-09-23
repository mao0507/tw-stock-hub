<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useWatchlistStore } from '@/stores/watchlist.store'
import { stockApi } from '@tw-stock-hub/api-client'
import type { WatchlistItem, StockLatestQuote, NewsItem } from '@tw-stock-hub/types'
import {
  StockPriceTag, AppButton, AppModal, AppInput,
  LoadingSkeleton, EmptyState, NewsCard, useStaggerIn,
} from '@tw-stock-hub/ui'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'

gsap.registerPlugin(Flip)

const router = useRouter()
const watchlistStore = useWatchlistStore()
const { watchlist, isLoading } = storeToRefs(watchlistStore)

const rootEl = ref<HTMLElement>()
const listEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.watchlist-card')

const quotesMap = ref<Record<string, StockLatestQuote>>({})
const newsMap = ref<Record<string, NewsItem | null>>({})
const loadingQuotes = ref(false)

const removeTarget = ref<string | null>(null)
const removeLoading = ref(false)

const editTarget = ref<WatchlistItem | null>(null)
const editNote = ref('')
const editLoading = ref(false)

onMounted(async () => {
  await watchlistStore.fetchWatchlist()
  await loadQuotesAndNews()
})

async function loadQuotesAndNews(): Promise<void> {
  if (!watchlist.value.length) return
  loadingQuotes.value = true
  try {
    await Promise.allSettled(
      watchlist.value.map(async (item) => {
        const [stock, news] = await Promise.allSettled([
          stockApi.getStockDetail(item.stockId),
          stockApi.getStockNews(item.stockId, { limit: 1 }),
        ])
        if (stock.status === 'fulfilled') {
          quotesMap.value = { ...quotesMap.value, [item.stockId]: stock.value }
        }
        if (news.status === 'fulfilled' && news.value.items.length > 0) {
          newsMap.value = { ...newsMap.value, [item.stockId]: news.value.items[0] ?? null }
        } else {
          newsMap.value = { ...newsMap.value, [item.stockId]: null }
        }
      })
    )
  } finally {
    loadingQuotes.value = false
  }
}

async function confirmRemove(): Promise<void> {
  if (!removeTarget.value) return
  removeLoading.value = true
  const state = listEl.value
    ? Flip.getState(listEl.value.querySelectorAll('.watchlist-card'))
    : null
  try {
    const id = removeTarget.value
    await watchlistStore.remove(id)
    const { [id]: _q, ...restQ } = quotesMap.value
    const { [id]: _n, ...restN } = newsMap.value
    quotesMap.value = restQ
    newsMap.value = restN
    removeTarget.value = null
    await nextTick()
    if (state) Flip.from(state, { duration: 0.4, ease: 'power2.inOut', absolute: true })
  } catch {
    alert('移除失敗，請稍後再試')
  } finally {
    removeLoading.value = false
  }
}

function openEdit(item: WatchlistItem): void {
  editTarget.value = item
  editNote.value = item.note ?? ''
}

async function saveNote(): Promise<void> {
  if (!editTarget.value) return
  editLoading.value = true
  try {
    await watchlistStore.updateNote(editTarget.value.stockId, editNote.value || null)
    editTarget.value = null
  } catch {
    alert('儲存失敗，請稍後再試')
  } finally {
    editLoading.value = false
  }
}

function goToStock(id: string): void {
  void router.push({ name: 'stock-detail', params: { id } })
}
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-6"
  >
    <header class="page-head">
      <div>
        <h1 class="page-head-title">自選股</h1>
        <div class="page-head-sub">WATCHLIST</div>
      </div>
      <div class="page-head-meta">{{ watchlist.length }} 支追蹤中</div>
    </header>

    <div
      v-if="isLoading"
      class="space-y-3"
    >
      <LoadingSkeleton
        v-for="i in 4"
        :key="i"
        type="card"
      />
    </div>

    <EmptyState
      v-else-if="!isLoading && watchlist.length === 0"
      title="還沒有追蹤任何股票"
      description="在個股頁點擊「加入自選」開始追蹤"
      icon="star"
    >
      <template #action>
        <AppButton
          variant="outline"
          size="sm"
          @click="void router.push('/')"
        >
          前往探索
        </AppButton>
      </template>
    </EmptyState>

    <div
      v-else
      ref="listEl"
      class="space-y-4"
    >
      <div
        v-for="item in watchlist"
        :key="item.stockId"
        class="watchlist-card card p-0 transition-shadow hover:shadow-md"
      >
        <div class="flex items-center gap-3 border-b border-gray-50 p-4">
          <div
            class="flex cursor-pointer items-center gap-2 flex-1"
            @click="goToStock(item.stockId)"
          >
            <span class="font-mono text-sm font-bold text-blue-600 hover:underline">{{ item.stockId }}</span>
            <span class="font-medium text-gray-800">{{ quotesMap[item.stockId]?.name ?? '載入中…' }}</span>
          </div>

          <div class="text-right">
            <LoadingSkeleton
              v-if="loadingQuotes && !quotesMap[item.stockId]"
              type="text"
              :rows="1"
            />
            <StockPriceTag
              v-else-if="quotesMap[item.stockId]?.latestQuote"
              :price="quotesMap[item.stockId]!.latestQuote!.close"
              :change-pct="quotesMap[item.stockId]!.latestQuote!.changePct"
              size="sm"
            />
          </div>

          <div class="flex items-center gap-2 ml-2">
            <button
              class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="編輯備註"
              @click="openEdit(item)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
            </button>
            <button
              class="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
              title="移除"
              @click="removeTarget = item.stockId"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" /></svg>
            </button>
          </div>
        </div>

        <div
          v-if="item.note"
          class="border-b border-gray-50 px-4 py-2"
        >
          <span class="text-xs text-gray-400">備註：</span>
          <span class="text-xs text-gray-600">{{ item.note }}</span>
        </div>

        <div class="px-2">
          <LoadingSkeleton
            v-if="loadingQuotes && !(item.stockId in newsMap)"
            type="list"
            :rows="1"
          />
          <NewsCard
            v-else-if="newsMap[item.stockId]"
            :news="newsMap[item.stockId]!"
          />
          <p
            v-else
            class="px-2 py-3 text-xs text-gray-300"
          >
            暫無相關新聞
          </p>
        </div>
      </div>
    </div>

    <!-- 移除確認 Modal -->
    <AppModal
      :open="!!removeTarget"
      title="確認移除"
      size="sm"
      @close="removeTarget = null"
    >
      <p class="text-sm text-gray-600">
        確定要從自選股中移除
        <strong class="font-mono text-gray-900">{{ removeTarget }}</strong> 嗎？
      </p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="removeTarget = null"
          >
            取消
          </AppButton>
          <AppButton
            variant="destructive"
            :loading="removeLoading"
            @click="confirmRemove"
          >
            確認移除
          </AppButton>
        </div>
      </template>
    </AppModal>

    <!-- 備註編輯 Modal -->
    <AppModal
      :open="!!editTarget"
      title="編輯備註"
      size="sm"
      @close="editTarget = null"
    >
      <div class="space-y-3">
        <p class="text-xs text-gray-400">
          {{ editTarget?.stockId }} 的備註（最多 200 字）
        </p>
        <AppInput
          v-model="editNote"
          placeholder="輸入備註，例：長期持有"
          :label="''"
        />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="editTarget = null"
          >
            取消
          </AppButton>
          <AppButton
            :loading="editLoading"
            @click="saveNote"
          >
            儲存
          </AppButton>
        </div>
      </template>
    </AppModal>
  </div>
</template>
