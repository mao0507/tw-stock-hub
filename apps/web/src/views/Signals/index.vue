<script setup lang="ts">
// 今日訊號（#31）：最新訊號日的訊號，依訊號類型分組；可切換全市場／自選股／持股、多空
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { stockApi } from '@tw-stock-hub/api-client'
import { SIGNAL_META, type SignalCode, type SignalScope, type SignalSide, type TodaySignals } from '@tw-stock-hub/types'
import { LoadingSkeleton } from '@tw-stock-hub/ui'
import { useAuthStore } from '@/stores/auth.store'

const { isLoggedIn } = storeToRefs(useAuthStore())

const scope = ref<SignalScope>('all')
const side = ref<SignalSide | 'all'>('all')
const data = ref<TodaySignals | null>(null)
const loading = ref(false)
const failed = ref(false)
const expanded = ref(new Set<string>())
const PREVIEW = 12

const scopes = computed(() => [
  { value: 'all' as const, label: '全市場' },
  ...(isLoggedIn.value
    ? [
        { value: 'mine' as const, label: '我的股票' },
        { value: 'watchlist' as const, label: '自選股' },
        { value: 'holdings' as const, label: '持股' },
      ]
    : []),
])

async function load(): Promise<void> {
  loading.value = true
  failed.value = false
  const s = scope.value
  try {
    const res = await stockApi.getTodaySignals({ scope: s })
    if (s === scope.value) data.value = res
  } catch (e) {
    console.warn('[Signals] load failed', e)
    failed.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(scope, () => { expanded.value = new Set(); void load() })

// 依 SIGNAL_META 的順序分組；多空篩選在前端做（兩種範圍一致）
const groups = computed(() => {
  const items = (data.value?.items ?? []).filter((i) => side.value === 'all' || i.side === side.value)
  const by = new Map<string, typeof items>()
  for (const i of items) by.set(i.signal, [...(by.get(i.signal) ?? []), i])
  const order = Object.keys(SIGNAL_META)
  return [...by.entries()]
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999))
    .map(([code, list]) => ({
      code,
      label: SIGNAL_META[code as SignalCode]?.label ?? code,
      // 爆量的多空依當日漲跌，組別以「多數」決定顏色
      side: list.filter((i) => i.side === 'bull').length >= list.length / 2 ? 'bull' as const : 'bear' as const,
      list,
    }))
})
const total = computed(() => groups.value.reduce((n, g) => n + g.list.length, 0))

function toggle(code: string): void {
  const next = new Set(expanded.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  expanded.value = next
}
const pct = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">
          今日訊號
        </h1>
        <div class="page-head-sub">
          TECHNICAL SIGNALS{{ data?.date ? ` · ${data.date}` : '' }}
        </div>
      </div>
      <div class="page-head-meta">
        盤後依日線自動偵測，僅供參考、非買賣建議
      </div>
    </header>

    <div class="flex flex-wrap items-center gap-2">
      <div
        class="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="範圍"
      >
        <button
          v-for="s in scopes"
          :key="s.value"
          type="button"
          role="tab"
          :aria-selected="scope === s.value"
          :class="['pill', scope === s.value && 'pill-on']"
          @click="scope = s.value"
        >
          {{ s.label }}
        </button>
      </div>
      <div
        class="bs-toggle ml-auto"
        role="tablist"
        aria-label="多空"
      >
        <button
          type="button"
          :class="['bs', side === 'all' && 'bg-ink text-white']"
          @click="side = 'all'"
        >
          全部
        </button>
        <button
          type="button"
          :class="['bs', side === 'bull' && 'bs-buy']"
          @click="side = 'bull'"
        >
          多方
        </button>
        <button
          type="button"
          :class="['bs', side === 'bear' && 'bs-sell']"
          @click="side = 'bear'"
        >
          空方
        </button>
      </div>
    </div>

    <LoadingSkeleton
      v-if="loading && !data"
      :rows="6"
    />
    <p
      v-else-if="failed"
      role="alert"
      class="rounded-xl bg-red-50 p-3 text-sm text-red-700"
    >
      訊號載入失敗，請稍後再試
    </p>
    <div
      v-else-if="!total"
      class="panel p-8 text-center text-sm text-gray-500"
    >
      {{ scope === 'all' ? '最新交易日沒有符合條件的訊號' : '你的股票在最新交易日沒有出現訊號' }}
    </div>

    <template v-else>
      <p class="text-sm text-gray-600">
        共 <span class="font-mono font-semibold text-gray-900">{{ total }}</span> 個訊號，{{ groups.length }} 種類型
      </p>
      <nav
        aria-label="訊號類型"
        class="flex flex-wrap gap-1.5"
      >
        <a
          v-for="g in groups"
          :key="g.code"
          :href="`#sig-${g.code}`"
          class="pill inline-flex items-center gap-1.5"
        >
          <span :class="g.side === 'bull' ? 'is-up' : 'is-dn'">{{ g.side === 'bull' ? '▲' : '▼' }}</span>
          {{ g.label }}
          <span class="font-mono text-xs text-gray-500">{{ g.list.length }}</span>
        </a>
      </nav>
      <section
        v-for="g in groups"
        :id="`sig-${g.code}`"
        :key="g.code"
        class="panel scroll-mt-24"
      >
        <div class="panel-hd items-center">
          <h2 class="panel-title flex items-center gap-2">
            <span
              class="font-mono text-sm"
              :class="g.side === 'bull' ? 'is-up' : 'is-dn'"
            >{{ g.side === 'bull' ? '▲' : '▼' }}</span>
            {{ g.label }}
          </h2>
          <span class="font-mono text-sm text-gray-500">{{ g.list.length }} 檔</span>
        </div>
        <ul class="grid grid-cols-1 gap-x-4 px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="i in expanded.has(g.code) ? g.list : g.list.slice(0, PREVIEW)"
            :key="i.stockId"
          >
            <router-link
              :to="{ name: 'stock-detail', params: { id: i.stockId } }"
              class="flex min-h-[44px] items-center gap-2 border-b border-paper-line px-1 hover:bg-gray-50"
            >
              <span class="truncate text-sm font-medium text-gray-900">{{ i.stockName }}</span>
              <span class="font-mono text-xs text-gray-500">{{ i.stockId }}</span>
              <span
                v-if="i.inHoldings"
                class="badge bg-ink-soft px-1.5 py-0 text-[10px] text-ink"
              >持股</span>
              <span class="ml-auto whitespace-nowrap font-mono text-xs">
                <span class="text-gray-700">{{ i.close ?? '—' }}</span>
                <span
                  class="ml-1.5"
                  :class="(i.changePct ?? 0) > 0 ? 'is-up' : (i.changePct ?? 0) < 0 ? 'is-dn' : 'is-flat'"
                >{{ pct(i.changePct) }}</span>
              </span>
            </router-link>
          </li>
        </ul>
        <button
          v-if="g.list.length > PREVIEW"
          type="button"
          class="w-full border-t border-paper-line py-2.5 text-sm text-ink hover:bg-gray-50"
          @click="toggle(g.code)"
        >
          {{ expanded.has(g.code) ? '收合' : `顯示全部 ${g.list.length} 檔` }}
        </button>
      </section>
    </template>
  </div>
</template>
