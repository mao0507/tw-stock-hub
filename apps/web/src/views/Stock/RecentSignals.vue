<script setup lang="ts">
// 近期技術訊號（#29）：最新訊號日往回約 90 天，依日期分組
import { computed, ref, watch } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import { signalLabel, type TechnicalSignal } from '@tw-stock-hub/types'

const props = defineProps<{ stockId: string }>()

const signals = ref<TechnicalSignal[] | null>(null)
const failed = ref(false)

watch(() => props.stockId, async (id) => {
  signals.value = null
  failed.value = false
  try {
    const res = await stockApi.getSignals(id)
    if (id === props.stockId) signals.value = res
  } catch (e) {
    console.warn('[RecentSignals] load failed', e)
    if (id === props.stockId) failed.value = true
  }
}, { immediate: true })

const byDate = computed(() => {
  const groups = new Map<string, TechnicalSignal[]>()
  for (const s of signals.value ?? []) groups.set(s.date, [...(groups.get(s.date) ?? []), s])
  return [...groups]
})

// 數值欄位的中文名稱與格式
const VALUE_LABEL: Record<string, string> = {
  close: '收盤', prior_high: '前高', prior_low: '前低', upper: '上軌', lower: '下軌',
  k: 'K', d: 'D', rsi: 'RSI', dif: 'DIF', dea: 'DEA',
  ma5: 'MA5', ma10: 'MA10', ma20: 'MA20', ma60: 'MA60', volume: '成交量', ratio: '均量倍數',
}
function describe(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([k, v]) => {
      if (k === 'volume') return `成交量 ${Math.round(v / 1000).toLocaleString()} 張`
      if (k === 'ratio') return `${v} 倍均量`
      return `${VALUE_LABEL[k] ?? k} ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    })
    .join('、')
}
</script>

<template>
  <section class="panel">
    <div class="panel-hd">
      <h3 class="panel-title">
        近期訊號
      </h3>
      <span class="panel-tag">約 90 天</span>
    </div>
    <p
      v-if="failed"
      class="p-5 text-sm text-gray-500"
    >
      訊號載入失敗
    </p>
    <p
      v-else-if="signals && !signals.length"
      class="p-5 text-sm text-gray-500"
    >
      近 90 天沒有偵測到技術訊號
    </p>
    <ol
      v-else-if="signals"
      class="max-h-[420px] divide-y divide-paper-line overflow-y-auto"
    >
      <li
        v-for="[day, items] in byDate"
        :key="day"
        class="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:gap-5"
      >
        <span class="w-24 flex-shrink-0 font-mono text-sm text-gray-600">{{ day }}</span>
        <ul class="flex flex-1 flex-col gap-1.5">
          <li
            v-for="s in items"
            :key="s.signal"
            class="flex flex-wrap items-baseline gap-x-2"
          >
            <span
              class="font-mono text-xs"
              :class="s.side === 'bull' ? 'is-up' : 'is-dn'"
              :aria-label="s.side === 'bull' ? '多方' : '空方'"
            >{{ s.side === 'bull' ? '▲' : '▼' }}</span>
            <span class="text-sm font-medium text-gray-900">{{ signalLabel(s.signal) }}</span>
            <span class="text-xs text-gray-500">{{ describe(s.values) }}</span>
          </li>
        </ul>
      </li>
    </ol>
    <p class="border-t border-paper-line px-5 py-2.5 text-xs text-gray-500">
      訊號依盤後日線自動偵測，僅供參考，不構成買賣建議。
    </p>
  </section>
</template>
