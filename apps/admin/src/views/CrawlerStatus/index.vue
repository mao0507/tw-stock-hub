<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import axios from 'axios'
import { useECharts, STOCK_COLORS } from '@tw-stock-hub/charts'
import type { ECOption } from '@tw-stock-hub/charts'
import { useStaggerIn, AppSelect, AppDatePicker, AppAlertDialog } from '@tw-stock-hub/ui'

const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, 'section')

interface CrawlerLog {
  id: number
  crawlerName: string
  runAt: string
  status: 'success' | 'failed' | 'partial'
  recordsCount: number | null
  errorMessage: string | null
  durationMs: number | null
}

interface CrawlerSummary {
  crawlerName: string
  lastRunAt: string | null
  lastStatus: 'success' | 'failed' | 'partial' | 'never'
  lastRecords: number | null
}

interface PaginatedCrawlerLogs {
  items: CrawlerLog[]
  total: number
  page: number
  pageSize: number
}

const summaries = ref<CrawlerSummary[]>([])
const failureLogs = ref<CrawlerLog[]>([])
const isLoading = ref(false)
const triggerLoading = ref<string | null>(null)
const triggerResult = ref<{ crawler: string; success: boolean; message: string } | null>(null)

const logs = ref<CrawlerLog[]>([])
const logTotal = ref(0)
const logPage = ref(1)
const logPageSize = 20
const filterCrawler = ref('')
const filterStatus = ref('')
const filterFrom = ref('')
const filterTo = ref('')
const isLogsLoading = ref(false)

const logTotalPages = computed(() => Math.max(1, Math.ceil(logTotal.value / logPageSize)))

const { chartContainer, setOption, isReady } = useECharts()

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

// admin 在台北時區操作，但 runAt 存 UTC，查詢區間要帶 +08:00 才不會在日界線漏資料
const TZ_OFFSET = '+08:00'

const ALL_VALUE = 'ALL'
// crawler 清單從實際 summary 結果推導，不手刻，避免跟 scheduler 的 job 清單脫鉤
const crawlerOptions = computed(() => [
  { label: '全部', value: ALL_VALUE },
  ...summaries.value.map(s => ({ label: s.crawlerName, value: s.crawlerName })),
])
const statusOptions = [
  { label: '全部', value: ALL_VALUE },
  { label: '成功', value: 'success' },
  { label: '失敗', value: 'failed' },
  { label: '部分', value: 'partial' },
]

async function fetchSummaries(): Promise<void> {
  isLoading.value = true
  try {
    const { data } = await axios.get<CrawlerSummary[]>('/api/admin/crawler-logs/summary')
    summaries.value = data
  } catch {
    summaries.value = []
  } finally {
    isLoading.value = false
  }
}

async function fetchFailureLogs(): Promise<void> {
  const from = new Date()
  from.setDate(from.getDate() - 6)
  from.setHours(0, 0, 0, 0)
  try {
    const { data } = await axios.get<PaginatedCrawlerLogs>('/api/admin/crawler-logs', {
      params: { status: 'failed', from: from.toISOString(), pageSize: 100 },
    })
    failureLogs.value = data.items
  } catch {
    failureLogs.value = []
  }
}

async function fetchLogs(): Promise<void> {
  isLogsLoading.value = true
  try {
    const { data } = await axios.get<PaginatedCrawlerLogs>('/api/admin/crawler-logs', {
      params: {
        page: logPage.value,
        pageSize: logPageSize,
        crawlerName: filterCrawler.value || undefined,
        status: filterStatus.value || undefined,
        from: filterFrom.value ? `${filterFrom.value}T00:00:00${TZ_OFFSET}` : undefined,
        to: filterTo.value ? `${filterTo.value}T23:59:59${TZ_OFFSET}` : undefined,
      },
    })
    logs.value = data.items
    logTotal.value = data.total
  } catch {
    logs.value = []
    logTotal.value = 0
  } finally {
    isLogsLoading.value = false
  }
}

async function fetchData(): Promise<void> {
  await Promise.all([fetchSummaries(), fetchFailureLogs(), fetchLogs()])
}

function applyFilters(): void {
  logPage.value = 1
  void fetchLogs()
}

function resetFilters(): void {
  filterCrawler.value = ''
  filterStatus.value = ''
  filterFrom.value = ''
  filterTo.value = ''
  logPage.value = 1
  void fetchLogs()
}

function goToPage(page: number): void {
  if (page < 1 || page > logTotalPages.value) return
  logPage.value = page
  void fetchLogs()
}

const pendingCrawler = ref<string | null>(null)

function triggerCrawler(crawlerName: string): void {
  if (triggerLoading.value) return
  pendingCrawler.value = crawlerName
}

function cancelTrigger(): void {
  pendingCrawler.value = null
}

async function confirmTrigger(): Promise<void> {
  const crawlerName = pendingCrawler.value
  if (!crawlerName) return
  pendingCrawler.value = null

  triggerLoading.value = crawlerName
  triggerResult.value = null
  try {
    const { data } = await axios.post<{ count: number }>('/api/admin/trigger-crawler', { crawlerName })
    triggerResult.value = { crawler: crawlerName, success: true, message: `執行完成，寫入 ${data.count} 筆` }
    await fetchData()
  } catch {
    triggerResult.value = { crawler: crawlerName, success: false, message: '觸發失敗' }
  } finally {
    triggerLoading.value = null
  }
}

const failureChartOption = computed((): ECOption => {
  const last7Days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    last7Days.push(d.toISOString().split('T')[0]!)
  }

  const failureByDay = last7Days.map(date =>
    failureLogs.value.filter(l => l.runAt.startsWith(date)).length,
  )

  return {
    backgroundColor: 'transparent',
    grid: { top: 16, right: 16, bottom: 32, left: 36 },
    xAxis: {
      type: 'category',
      data: last7Days.map(d => d.slice(5)),
      axisLabel: { color: '#6B7280', fontSize: 11 },
      axisLine: { lineStyle: { color: '#374151' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#6B7280', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1F2937', type: 'dashed' } },
    },
    series: [{
      type: 'bar',
      data: failureByDay.map(v => ({
        value: v,
        itemStyle: { color: v > 0 ? STOCK_COLORS.up : '#374151' },
      })),
      barMaxWidth: 24,
    }],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111827',
      borderColor: 'transparent',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (p: unknown) => {
        const ps = p as { name: string; value: number }[]
        return `${ps[0]?.name}：<b>${ps[0]?.value} 次失敗</b>`
      },
    },
  }
})

watch([isReady, () => failureLogs.value.length], ([ready]) => {
  if (ready) setOption(failureChartOption.value, true)
})

onMounted(() => {
  void fetchData()
  autoRefreshTimer = setInterval(() => { void fetchData() }, 60_000)
})

onUnmounted(() => {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
})

function statusBadge(status: string): string {
  return ({ success: 'badge-ok', failed: 'badge-error', partial: 'badge-pending', never: 'badge bg-white/5 text-gray-600' } as Record<string, string>)[status] ?? 'badge bg-white/5 text-gray-500'
}

function statusLabel(status: string): string {
  return ({ success: '成功', failed: '失敗', partial: '部分', never: '未執行' } as Record<string, string>)[status] ?? '?'
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '從未執行'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  return `${Math.floor(hours / 24)} 天前`
}
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-6"
  >
    <div
      v-if="triggerResult"
      :class="['flex items-center justify-between rounded-lg p-3 text-sm', triggerResult.success ? 'bg-down/10 text-down' : 'bg-up/10 text-up']"
    >
      <span>[{{ triggerResult.crawler }}] {{ triggerResult.message }}</span>
      <button
        class="text-xs opacity-60 hover:opacity-100"
        @click="triggerResult = null"
      >
        ✕
      </button>
    </div>

    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        爬蟲狀態
      </h2>
      <div class="card overflow-hidden p-0">
        <table class="table-modern">
          <thead>
            <tr>
              <th>爬蟲名稱</th>
              <th>最後執行</th>
              <th><div class="flex justify-center">狀態</div></th>
              <th><div class="flex justify-end">筆數</div></th>
              <th><div class="flex justify-end">操作</div></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in summaries"
              :key="s.crawlerName"
            >
              <td class="font-mono text-xs">{{ s.crawlerName }}</td>
              <td class="text-xs text-gray-400">{{ relativeTime(s.lastRunAt) }}</td>
              <td>
                <div class="flex justify-center">
                  <span :class="statusBadge(s.lastStatus)">{{ statusLabel(s.lastStatus) }}</span>
                </div>
              </td>
              <td class="text-right font-mono text-xs text-gray-400">
                {{ s.lastRecords?.toLocaleString() ?? '—' }}
              </td>
              <td>
                <div class="flex justify-end">
                  <button
                    :disabled="!!triggerLoading"
                    class="btn-ghost px-2.5 py-1 text-xs"
                    @click="triggerCrawler(s.crawlerName)"
                  >
                    {{ triggerLoading === s.crawlerName ? '執行中…' : '觸發' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 class="mb-3 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
        近 7 日失敗次數
      </h2>
      <div class="card">
        <div
          ref="chartContainer"
          style="height: 160px"
          class="w-full"
        />
      </div>
    </section>

    <section>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-display text-xs font-bold uppercase tracking-wide text-gray-500">
          執行記錄查詢
        </h2>
        <button
          class="text-xs text-gray-500 hover:text-white"
          @click="void fetchLogs()"
        >
          ↻ 刷新
        </button>
      </div>

      <div class="card mb-3 flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-gray-500">爬蟲</label>
          <AppSelect
            :model-value="filterCrawler || ALL_VALUE"
            variant="dark"
            :options="crawlerOptions"
            class="w-48"
            @update:model-value="(v) => filterCrawler = v === ALL_VALUE ? '' : v"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-gray-500">狀態</label>
          <AppSelect
            :model-value="filterStatus || ALL_VALUE"
            variant="dark"
            :options="statusOptions"
            class="w-28"
            @update:model-value="(v) => filterStatus = v === ALL_VALUE ? '' : v"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-gray-500">起始日期</label>
          <AppDatePicker
            v-model="filterFrom"
            variant="dark"
            class="w-36"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-gray-500">結束日期</label>
          <AppDatePicker
            v-model="filterTo"
            variant="dark"
            class="w-36"
          />
        </div>

        <button
          class="btn-primary px-3 py-1.5 text-xs"
          @click="applyFilters"
        >
          查詢
        </button>
        <button
          class="btn-ghost px-3 py-1.5 text-xs"
          @click="resetFilters"
        >
          清除篩選
        </button>

        <span class="ml-auto font-mono text-xs text-gray-500">
          共 {{ logTotal.toLocaleString() }} 筆
        </span>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="table-modern text-xs">
          <thead>
            <tr>
              <th>爬蟲</th>
              <th>執行時間</th>
              <th><div class="flex justify-center">狀態</div></th>
              <th><div class="flex justify-end">筆數</div></th>
              <th><div class="flex justify-end">耗時</div></th>
            </tr>
          </thead>
          <tbody>
            <template
              v-for="log in logs"
              :key="log.id"
            >
              <tr>
                <td class="font-mono">{{ log.crawlerName }}</td>
                <td class="font-mono text-gray-400">{{ new Date(log.runAt).toLocaleString('zh-TW') }}</td>
                <td>
                  <div class="flex justify-center">
                    <span :class="statusBadge(log.status)">{{ statusLabel(log.status) }}</span>
                  </div>
                </td>
                <td class="text-right font-mono">{{ log.recordsCount?.toLocaleString() ?? '—' }}</td>
                <td class="text-right font-mono text-gray-400">
                  {{ log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '—' }}
                </td>
              </tr>
              <tr v-if="log.errorMessage">
                <td
                  colspan="5"
                  class="bg-up/[0.06] font-mono text-[11px] text-up"
                >
                  ⚠ {{ log.errorMessage }}
                </td>
              </tr>
            </template>
            <tr v-if="!isLogsLoading && !logs.length">
              <td
                colspan="5"
                class="border-b-0 py-8 text-center text-gray-600"
              >
                無執行紀錄
              </td>
            </tr>
            <tr v-if="isLogsLoading">
              <td
                colspan="5"
                class="border-b-0 py-8 text-center text-gray-600"
              >
                載入中…
              </td>
            </tr>
          </tbody>
        </table>

        <div class="flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs text-gray-500">
          <span class="font-mono">第 {{ logPage }} / {{ logTotalPages }} 頁</span>
          <div class="flex gap-1">
            <button
              class="rounded px-2 py-1 hover:bg-white/10 hover:text-white disabled:opacity-30"
              :disabled="logPage <= 1"
              @click="goToPage(1)"
            >
              «
            </button>
            <button
              class="rounded px-2 py-1 hover:bg-white/10 hover:text-white disabled:opacity-30"
              :disabled="logPage <= 1"
              @click="goToPage(logPage - 1)"
            >
              ‹ 上一頁
            </button>
            <button
              class="rounded px-2 py-1 hover:bg-white/10 hover:text-white disabled:opacity-30"
              :disabled="logPage >= logTotalPages"
              @click="goToPage(logPage + 1)"
            >
              下一頁 ›
            </button>
            <button
              class="rounded px-2 py-1 hover:bg-white/10 hover:text-white disabled:opacity-30"
              :disabled="logPage >= logTotalPages"
              @click="goToPage(logTotalPages)"
            >
              »
            </button>
          </div>
        </div>
      </div>
    </section>

    <AppAlertDialog
      :open="!!pendingCrawler"
      variant="dark"
      title="手動執行爬蟲"
      :description="`確定要手動執行 ${pendingCrawler} ？`"
      confirm-text="執行"
      @confirm="confirmTrigger"
      @cancel="cancelTrigger"
    />
  </div>
</template>
