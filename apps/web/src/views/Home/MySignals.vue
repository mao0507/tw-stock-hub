<script setup lang="ts">
// 首頁「我的持股／自選股今日訊號」（#31）：登入時才顯示
import { computed, onMounted, ref } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import { signalLabel, type TodaySignals } from '@tw-stock-hub/types'

const data = ref<TodaySignals | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    data.value = await stockApi.getTodaySignals({ scope: 'mine' })
  } catch (e) {
    console.warn('[MySignals] load failed', e)
    failed.value = true
  }
})

// 依股票分組（API 已依股票排序）
const byStock = computed(() => {
  const m = new Map<string, NonNullable<typeof data.value>['items']>()
  for (const i of data.value?.items ?? []) m.set(i.stockId, [...(m.get(i.stockId) ?? []), i])
  return [...m.values()]
})
</script>

<template>
  <section class="panel">
    <div class="panel-hd items-center">
      <h2 class="panel-title">
        我的股票今日訊號
      </h2>
      <router-link
        :to="{ name: 'signals' }"
        class="text-sm text-ink hover:underline"
      >
        全市場訊號
      </router-link>
    </div>
    <p
      v-if="failed"
      class="p-5 text-sm text-gray-500"
    >
      訊號載入失敗
    </p>
    <p
      v-else-if="data && !byStock.length"
      class="p-5 text-sm text-gray-500"
    >
      你的持股與自選股在 {{ data.date ?? '最新交易日' }} 沒有出現技術訊號。
    </p>
    <ul
      v-else-if="data"
      class="divide-y divide-paper-line"
    >
      <li
        v-for="list in byStock"
        :key="list[0]!.stockId"
      >
        <router-link
          :to="{ name: 'stock-detail', params: { id: list[0]!.stockId } }"
          class="flex flex-col gap-1 px-5 py-3 hover:bg-gray-50 sm:flex-row sm:items-baseline sm:gap-4"
        >
          <span class="flex w-40 flex-shrink-0 items-baseline gap-2">
            <span class="font-medium text-gray-900">{{ list[0]!.stockName }}</span>
            <span class="font-mono text-xs text-gray-500">{{ list[0]!.stockId }}</span>
            <span
              v-if="list[0]!.inHoldings"
              class="badge bg-ink-soft px-1.5 py-0 text-[10px] text-ink"
            >持股</span>
          </span>
          <span class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span
              v-for="s in list"
              :key="s.signal"
              :class="s.side === 'bull' ? 'is-up' : 'is-dn'"
            >{{ s.side === 'bull' ? '▲' : '▼' }} {{ signalLabel(s.signal) }}</span>
          </span>
        </router-link>
      </li>
    </ul>
  </section>
</template>
