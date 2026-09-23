<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { useStaggerIn } from '@tw-stock-hub/ui'

const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.card')

interface TableHealth {
  tableName: string
  label: string
  latestDate: string | null
  expectedDate: string
  isHealthy: boolean
  missingDays: number
}

interface MissingByTable {
  daily_quotes: string[]
  institutional_trading: string[]
  margin_trading: string[]
  sector_performance: string[]
}

interface CountAnomaly {
  tableName: string
  label: string
  date: string
  count: number
  expectedCount: number
}

const TABLE_LABELS: Record<string, string> = {
  daily_quotes: '每日行情',
  institutional_trading: '三大法人',
  margin_trading: '融資融券',
  sector_performance: '類股指數',
}

const tableHealth = ref<TableHealth[]>([])
const missingByTable = ref<MissingByTable>({
  daily_quotes: [],
  institutional_trading: [],
  margin_trading: [],
  sector_performance: [],
})
const countAnomalies = ref<CountAnomaly[]>([])
const isLoading = ref(false)
const autoRefresh = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const hasIssues = computed(() => {
  const missing = Object.values(missingByTable.value).some(arr => arr.length > 0)
  return missing || countAnomalies.value.length > 0
})

const missingEntries = computed(() =>
  (Object.entries(missingByTable.value) as [keyof MissingByTable, string[]][])
    .filter(([, dates]) => dates.length > 0)
)

async function fetchHealth(): Promise<void> {
  isLoading.value = true
  try {
    const { data } = await axios.get<{
      tables: TableHealth[]
      missingByTable: MissingByTable
      countAnomalies: CountAnomaly[]
    }>('/api/admin/data-health')
    tableHealth.value = data.tables
    missingByTable.value = data.missingByTable
    countAnomalies.value = data.countAnomalies
  } catch {
    const today = new Date().toISOString().split('T')[0]!
    tableHealth.value = Object.entries(TABLE_LABELS).map(([tableName, label]) => ({
      tableName,
      label,
      latestDate: null,
      expectedDate: today,
      isHealthy: false,
      missingDays: 0,
    }))
    missingByTable.value = { daily_quotes: [], institutional_trading: [], margin_trading: [], sector_performance: [] }
    countAnomalies.value = []
  } finally {
    isLoading.value = false
  }
}

function toggleAutoRefresh(): void {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => { void fetchHealth() }, 30_000)
  } else {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }
}

onMounted(() => { void fetchHealth() })
onUnmounted(() => {
  if (refreshTimer !== null) clearInterval(refreshTimer)
})

function daysBehind(latest: string | null, expected: string): number {
  if (!latest) return 999
  return Math.floor((new Date(expected).getTime() - new Date(latest).getTime()) / 86_400_000)
}
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-6"
  >
    <div class="flex items-center justify-end gap-2">
      <button
        :class="['btn-ghost text-xs', autoRefresh && 'text-amber-400']"
        @click="toggleAutoRefresh"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        {{ autoRefresh ? '自動檢查中（每 30 秒）' : '自動檢查' }}
      </button>
      <button
        class="btn-ghost text-xs"
        @click="void fetchHealth()"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
        重新檢查
      </button>
    </div>

    <!-- 資料表健康狀態 -->
    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        資料表健康狀態
      </h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="t in tableHealth"
          :key="t.tableName"
          :class="[
            'card',
            t.isHealthy ? 'border-down/30 bg-down/[0.04]' : 'border-up/30 bg-up/[0.04]',
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-white">{{ t.label }}</span>
            <span :class="['h-2.5 w-2.5 rounded-full', t.isHealthy ? 'bg-down' : 'bg-up']" />
          </div>
          <div class="mt-2">
            <div class="font-mono text-xs text-gray-400">
              最新：<span :class="t.isHealthy ? 'text-down' : 'text-up'">
                {{ t.latestDate ?? '無資料' }}
              </span>
            </div>
            <div
              v-if="!t.isHealthy && t.latestDate"
              class="mt-0.5 font-mono text-xs text-up"
            >
              落後 {{ daysBehind(t.latestDate, t.expectedDate) }} 天
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 缺漏交易日（各表分開） -->
    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        缺漏交易日
        <span
          v-if="missingEntries.length"
          class="badge-error ml-2"
        >
          {{ missingEntries.length }} 個表有缺漏
        </span>
      </h2>
      <div class="card">
        <div
          v-if="isLoading"
          class="text-sm text-gray-500"
        >
          檢查中…
        </div>
        <div
          v-else-if="missingEntries.length === 0"
          class="text-sm text-down"
        >
          近 30 個交易日資料完整
        </div>
        <div
          v-else
          class="space-y-4"
        >
          <div
            v-for="[key, dates] in missingEntries"
            :key="key"
          >
            <p class="mb-1.5 text-xs font-medium text-gray-400">
              {{ TABLE_LABELS[key] }}
              <span class="badge-error ml-1.5">{{ dates.length }} 天</span>
            </p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="d in dates"
                :key="d"
                class="badge-error font-mono"
              >{{ d }}</span>
            </div>
          </div>
          <p class="mt-1 text-xs text-gray-500">
            補爬指令範例：<code class="rounded bg-white/5 px-1.5 py-0.5 font-mono text-gray-300">
              make crawl-backfill CRAWLER=margin_twse DATE=YYYY-MM-DD
            </code>
          </p>
        </div>
      </div>
    </section>

    <!-- 資料數量異常 -->
    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        數量異常（低於中位數 60%）
        <span
          v-if="countAnomalies.length"
          class="badge-error ml-2"
        >
          {{ countAnomalies.length }} 筆
        </span>
      </h2>
      <div class="card">
        <div
          v-if="isLoading"
          class="text-sm text-gray-500"
        >
          檢查中…
        </div>
        <div
          v-else-if="countAnomalies.length === 0"
          class="text-sm text-down"
        >
          近 30 個交易日數量正常
        </div>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-white/10 text-left text-gray-500">
                <th class="pb-2 pr-4">資料表</th>
                <th class="pb-2 pr-4">日期</th>
                <th class="pb-2 pr-4 text-right">實際筆數</th>
                <th class="pb-2 text-right">預期（中位數）</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <tr
                v-for="a in countAnomalies"
                :key="`${a.tableName}-${a.date}`"
              >
                <td class="py-1.5 pr-4 text-gray-300">{{ a.label }}</td>
                <td class="py-1.5 pr-4 font-mono text-gray-300">{{ a.date }}</td>
                <td class="py-1.5 pr-4 text-right font-mono text-up">{{ a.count.toLocaleString() }}</td>
                <td class="py-1.5 text-right font-mono text-gray-400">{{ a.expectedCount.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 全部正常提示 -->
    <div
      v-if="!isLoading && !hasIssues && tableHealth.length > 0 && tableHealth.every(t => t.isHealthy)"
      class="card border-down/30 bg-down/[0.04] text-center text-sm text-down"
    >
      所有檢查項目正常
    </div>
  </div>
</template>
