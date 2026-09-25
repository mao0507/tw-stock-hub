<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useStockStore } from '@/stores/stock.store'
import { useWatchlistStore } from '@/stores/watchlist.store'
import { useAuthStore } from '@/stores/auth.store'
import { KLineChart, InstitutionalChart, MarginChart } from '@tw-stock-hub/charts'
import {
  DataTable, LoadingSkeleton,
  NewsFeed, AppButton, AppInput, useStaggerIn,
} from '@tw-stock-hub/ui'
import { stockApi } from '@tw-stock-hub/api-client'
import OverviewTab from './OverviewTab.vue'
import FundamentalTab from './FundamentalTab.vue'
import type {
  BrokerRanking, BrokerDetail, SectorStockItem, BrokerConcentration, BrokerStreak,
  DividendItem, BacktestResult,
} from '@tw-stock-hub/types'

type Interval = 'daily' | 'weekly' | 'monthly'
type TabKey = 'overview' | 'technical' | 'fundamental' | 'chips' | 'dividend' | 'backtest' | 'news' | 'mops'
type ChipView = 'institutional' | 'margin' | 'broker'
type InstType = 'foreign' | 'trust' | 'dealer' | 'total'

const route = useRoute()
const stockId = computed(() => route.params['id'] as string)
const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.card')

const stockStore = useStockStore()
const watchlistStore = useWatchlistStore()
const authStore = useAuthStore()

const { currentStock, quoteData, institutionalData, marginData, isLoading } = storeToRefs(stockStore)
const { watchlist } = storeToRefs(watchlistStore)
const { isLoggedIn } = storeToRefs(authStore)

const activeTab = ref<TabKey>('overview')
const interval = ref<Interval>('daily')
const instType = ref<InstType>('foreign')

// 籌碼分析子頁籤
const chipView = ref<ChipView>('institutional')
const chipViews: { key: ChipView; label: string }[] = [
  { key: 'institutional', label: '三大法人' },
  { key: 'margin', label: '融資融券' },
  // 分點進出屬 Phase 3
]

// 總覽「→」導向：籌碼類鍵映射到 chips 子頁籤；Phase 3 才開放的頁籤（新聞、回測、分點）直接忽略
function goTab(key: string): void {
  if (chipViews.some((v) => v.key === key)) {
    activeTab.value = 'chips'
    chipView.value = key as ChipView
  } else if (tabs.some((t) => t.key === key)) {
    activeTab.value = key as TabKey
  }
}

const broker = ref<BrokerRanking | null>(null)
const brokerLoading = ref(false)
const concentration = ref<BrokerConcentration | null>(null)
const streak = ref<BrokerStreak | null>(null)

async function loadBroker(): Promise<void> {
  if (broker.value?.stockId === stockId.value) return
  brokerLoading.value = true
  try {
    broker.value = await stockApi.getBrokerRanking({ stockId: stockId.value, limit: 15 })
    concentration.value = await stockApi.getBrokerConcentration({ stockId: stockId.value }).catch(() => null)
  } catch {
    broker.value = { stockId: stockId.value, date: null, topBuy: [], topSell: [] }
  } finally {
    brokerLoading.value = false
  }
}

watch([activeTab, chipView], ([tab, view]) => {
  if (tab === 'chips' && view === 'broker') void loadBroker()
})

// ── 基本面內容移至 FundamentalTab；此處僅保留除權息分頁所需
const dividends = ref<DividendItem[]>([])
const isEtf = computed(() => /^00/.test(stockId.value))

// 除權息分頁
const divLoading = ref(false)
let divLoadedFor = ''
async function loadDividend(): Promise<void> {
  if (divLoadedFor === stockId.value) return
  divLoading.value = true
  try {
    dividends.value = await stockApi.getDividends(stockId.value)
    divLoadedFor = stockId.value
  } finally {
    divLoading.value = false
  }
}
watch(activeTab, tab => { if (tab === 'dividend') void loadDividend() })

// 回測分頁
const btFastPeriod = ref(5)
const btSlowPeriod = ref(20)
const btFrom = ref('')
const btTo = ref('')
const btLoading = ref(false)
const btError = ref('')
const btResult = ref<BacktestResult | null>(null)

async function runBacktest(): Promise<void> {
  btLoading.value = true
  btError.value = ''
  try {
    btResult.value = await stockApi.runBacktest({
      stockId: stockId.value,
      fastPeriod: btFastPeriod.value,
      slowPeriod: btSlowPeriod.value,
      from: btFrom.value || undefined,
      to: btTo.value || undefined,
    })
  } catch {
    btError.value = '回測失敗，請確認快線天數小於慢線天數'
    btResult.value = null
  } finally {
    btLoading.value = false
  }
}

const btColumns = [
  { key: 'entryDate', label: '進場日', align: 'left' as const },
  { key: 'entryPrice', label: '進場價', align: 'right' as const },
  { key: 'exitDate', label: '出場日', align: 'left' as const },
  { key: 'exitPrice', label: '出場價', align: 'right' as const },
  { key: 'returnPct', label: '報酬率%', align: 'right' as const },
]

// 分點價位別明細（點分點展開）
const expandedBroker = ref<string | null>(null)
const brokerDetail = ref<BrokerDetail | null>(null)
const detailLoading = ref(false)

async function toggleBrokerDetail(brokerName: string): Promise<void> {
  if (expandedBroker.value === brokerName) {
    expandedBroker.value = null
    return
  }
  expandedBroker.value = brokerName
  detailLoading.value = true
  brokerDetail.value = null
  streak.value = null
  try {
    const [detail, s] = await Promise.all([
      stockApi.getBrokerDetail({ stockId: stockId.value, brokerName }),
      stockApi.getBrokerStreak({ stockId: stockId.value, brokerName }).catch(() => null),
    ])
    brokerDetail.value = detail
    streak.value = s
  } finally {
    detailLoading.value = false
  }
}

const isInWatchlist = computed(() =>
  watchlist.value.some(w => w.stockId === stockId.value)
)

// ── 報價衍生指標
const q = computed(() => currentStock.value?.latestQuote ?? null)

// 52 週高低（250 根日 K ≈ 一年；僅在日線資料更新時重算，切週/月線不覆蓋）
const week52 = ref<{ hi: number; lo: number } | null>(null)
watch(quoteData, data => {
  if (interval.value !== 'daily' || !data.length) return
  week52.value = {
    hi: Math.max(...data.map(d => d.high)),
    lo: Math.min(...data.map(d => d.low)),
  }
})

const week52Pos = computed(() => {
  const w = week52.value
  const close = q.value?.close
  if (!w || close == null || w.hi <= w.lo) return null
  return Math.max(0, Math.min(100, ((close - w.lo) / (w.hi - w.lo)) * 100))
})

const amplitude = computed(() => {
  const lq = q.value
  if (!lq || !lq.prevClose) return null
  return ((lq.high - lq.low) / lq.prevClose) * 100
})

// 依漲跌方向上色（台股：紅漲綠跌）。比較基準為昨收。
function priceClass(price: number | null | undefined): string {
  const base = q.value?.prevClose
  if (price == null || base == null) return 'text-gray-700'
  if (price > base) return 'text-up'
  if (price < base) return 'text-down'
  return 'text-gray-700'
}

function fmtValue(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}億`
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}萬`
  return v.toLocaleString()
}

// ── 同類股
const peers = ref<SectorStockItem[]>([])

async function loadPeers(sector: string | null): Promise<void> {
  if (!sector) { peers.value = []; return }
  try {
    const res = await stockApi.getSectorStocks(sector)
    peers.value = res.stocks.filter(s => s.stockId !== stockId.value).slice(0, 12)
  } catch {
    peers.value = []
  }
}

onMounted(() => { void loadAll() })
watch(stockId, () => { void loadAll() })

async function loadAll(): Promise<void> {
  const id = stockId.value
  broker.value = null
  if (activeTab.value === 'chips' && chipView.value === 'broker') void loadBroker()
  await Promise.all([
    stockStore.fetchStock(id),
    stockStore.fetchQuote(id, { interval: interval.value, limit: 250 }),
    stockStore.fetchInstitutional(id, 60),
    stockStore.fetchMargin(id, 60),
  ])
  void loadPeers(currentStock.value?.sector ?? null)
  if (isLoggedIn.value) {
    await watchlistStore.fetchWatchlist()
  }
}

async function onIntervalChange(iv: Interval): Promise<void> {
  interval.value = iv
  await stockStore.fetchQuote(stockId.value, { interval: iv, limit: 250 })
}

async function toggleWatchlist(): Promise<void> {
  if (!isLoggedIn.value) return
  if (isInWatchlist.value) {
    await watchlistStore.remove(stockId.value)
  } else {
    await watchlistStore.add(stockId.value)
  }
}

const instColumns = [
  { key: 'date', label: '日期', align: 'left' as const },
  { key: 'foreignNet', label: '外資', align: 'right' as const, sortable: true },
  { key: 'trustNet', label: '投信', align: 'right' as const, sortable: true },
  { key: 'dealerNet', label: '自營', align: 'right' as const, sortable: true },
  { key: 'totalNet', label: '合計', align: 'right' as const, sortable: true },
]

const marginColumns = [
  { key: 'date', label: '日期', align: 'left' as const },
  { key: 'marginBalance', label: '融資餘額', align: 'right' as const },
  { key: 'marginChange', label: '融資增減', align: 'right' as const, sortable: true },
  { key: 'shortBalance', label: '融券餘額', align: 'right' as const },
  { key: 'shortChange', label: '融券增減', align: 'right' as const, sortable: true },
  { key: 'ratio', label: '券資比', align: 'right' as const },
]

// 法人 net 為股數 → 顯示張（1000 股）
function fmtNet(v: number): string {
  const lots = Math.round(v / 1000)
  const abs = Math.abs(lots)
  const sign = lots >= 0 ? '+' : '-'
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}萬張`
  return `${lots >= 0 ? '+' : ''}${lots.toLocaleString()}張`
}

function fmtShares(v: number): string {
  const abs = Math.abs(v)
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(1)}萬張`
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3).toLocaleString()}張`
  return `${sign}${abs.toLocaleString()}股`
}

// BSR 分點名稱為「4 碼券商代號 + 中文名」黏在一起，且名稱含全形 padding 空白。
function fmtBroker(name: string): string {
  const code = name.slice(0, 4)
  const label = name.slice(4).replace(/[\s　]+/g, '')
  return label ? `${code} ${label}` : name
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '總覽' },
  { key: 'technical', label: '技術分析' },
  { key: 'chips', label: '籌碼分析' },
  { key: 'fundamental', label: '基本面' },
  { key: 'dividend', label: '除權息' },
  // Phase 3 才提供：回測、相關新聞、重大訊息
]
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-4"
  >
    <!-- 股票頭部 -->
    <div v-if="isLoading && !currentStock">
      <LoadingSkeleton type="card" />
    </div>
    <div
      v-else-if="currentStock"
      class="card"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <!-- 名稱 + 報價 -->
        <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div class="flex items-center gap-2">
              <h1 class="font-display text-xl font-bold tracking-tight text-gray-900">
                {{ currentStock.name }}
              </h1>
              <span class="font-mono text-sm text-gray-400">{{ currentStock.id }}</span>
              <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {{ currentStock.market }}
              </span>
              <span
                v-if="currentStock.sector"
                class="rounded-full bg-up-soft px-2 py-0.5 text-xs text-up"
              >{{ currentStock.sector.replace('類指數', '') }}</span>
            </div>
            <div
              v-if="q"
              class="mt-2 flex items-end gap-3"
            >
              <span
                class="font-mono text-3xl font-semibold leading-none"
                :class="priceClass(q.close)"
              >{{ q.close.toFixed(2) }}</span>
              <span
                v-if="q.change != null"
                class="mb-0.5 font-mono text-sm"
                :class="q.change >= 0 ? 'text-up' : 'text-down'"
              >
                {{ q.change >= 0 ? '▲' : '▼' }}{{ Math.abs(q.change).toFixed(2) }}
                ({{ q.changePct != null ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : '—' }})
              </span>
            </div>
            <div
              v-if="q"
              class="mt-1 font-mono text-xs text-gray-400"
            >{{ q.date.slice(0, 10) }} 收盤</div>
          </div>
        </div>

        <AppButton
          v-if="isLoggedIn"
          :variant="isInWatchlist ? 'default' : 'outline'"
          size="sm"
          @click="toggleWatchlist"
        >
          {{ isInWatchlist ? '★ 已追蹤' : '☆ 加入自選' }}
        </AppButton>
      </div>

      <!-- 指標條 -->
      <div
        v-if="q"
        class="mt-4 grid grid-cols-3 gap-x-4 gap-y-2.5 border-t border-gray-100 pt-3 sm:grid-cols-4 lg:grid-cols-8"
      >
        <div class="stat-cell">
          <span class="stat-k">昨收</span>
          <span class="stat-v">{{ q.prevClose != null ? q.prevClose.toFixed(2) : '—' }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-k">開盤</span>
          <span class="stat-v" :class="priceClass(q.open)">{{ q.open.toFixed(2) }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-k">最高</span>
          <span class="stat-v" :class="priceClass(q.high)">{{ q.high.toFixed(2) }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-k">最低</span>
          <span class="stat-v" :class="priceClass(q.low)">{{ q.low.toFixed(2) }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-k">振幅</span>
          <span class="stat-v">{{ amplitude != null ? `${amplitude.toFixed(2)}%` : '—' }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-k">成交量</span>
          <span class="stat-v">{{ Math.round(q.volume / 1000).toLocaleString() }}張</span>
        </div>
        <div class="stat-cell">
          <span class="stat-k">成交值</span>
          <span class="stat-v">{{ fmtValue(q.value) }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-k">成交筆數</span>
          <span class="stat-v">{{ q.transactionCount != null ? q.transactionCount.toLocaleString() : '—' }}</span>
        </div>
      </div>

      <!-- 52 週區間 -->
      <div
        v-if="week52 && week52Pos != null"
        class="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3"
      >
        <span class="shrink-0 text-xs text-gray-400">52週</span>
        <span class="num shrink-0 text-xs text-down">{{ week52.lo.toFixed(2) }}</span>
        <div class="w52-track">
          <div class="w52-marker" :style="{ left: `${week52Pos}%` }" />
        </div>
        <span class="num shrink-0 text-xs text-up">{{ week52.hi.toFixed(2) }}</span>
        <span class="num shrink-0 text-xs text-gray-400">位階 {{ week52Pos.toFixed(0) }}%</span>
      </div>

      <!-- 同類股 -->
      <div
        v-if="peers.length"
        class="mt-3 border-t border-gray-100 pt-3"
      >
        <div class="mb-2 text-xs font-semibold text-gray-400">同類股</div>
        <div class="flex flex-wrap gap-2">
          <router-link
            v-for="p in peers"
            :key="p.stockId"
            :to="`/stocks/${p.stockId}`"
            class="flex items-center gap-1.5 rounded-md border border-gray-100 px-2 py-1 text-xs hover:bg-gray-50"
          >
            <span class="text-gray-700">{{ p.stockName }}</span>
            <span
              class="font-mono"
              :class="(p.changePct ?? 0) > 0 ? 'text-up' : (p.changePct ?? 0) < 0 ? 'text-down' : 'text-gray-400'"
            >{{ p.changePct == null ? '—' : `${p.changePct > 0 ? '+' : ''}${p.changePct.toFixed(2)}%` }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="card p-0">
      <div class="tab-strip sticky top-14 z-10 flex overflow-x-auto rounded-t-xl2 border-b border-gray-100 bg-white/95 backdrop-blur">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="[
            'shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors',
            activeTab === tab.key
              ? 'border-b-2 border-up text-up'
              : 'text-gray-500 hover:text-gray-700',
          ]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="p-4">
        <!-- Tab: 總覽 -->
        <OverviewTab
          v-if="activeTab === 'overview'"
          :stock-id="stockId"
          :quote-data="quoteData"
          :institutional-data="institutionalData"
          :margin-data="marginData"
          @go="goTab"
        />

        <!-- Tab: 技術分析 -->
        <div
          v-if="activeTab === 'technical'"
          class="space-y-3"
        >
          <LoadingSkeleton
            v-if="isLoading && !quoteData.length"
            type="chart"
          />
          <template v-else>
            <KLineChart
              :data="quoteData"
              :interval="interval"
              :height="380"
              @interval-change="onIntervalChange"
            />
          </template>
        </div>

        <!-- Tab: 基本面 -->
        <FundamentalTab
          v-else-if="activeTab === 'fundamental'"
          :stock-id="stockId"
          :institutional-data="institutionalData"
          :margin-data="marginData"
          @go="goTab"
        />

        <!-- Tab: 除權息 -->
        <div v-else-if="activeTab === 'dividend'" class="space-y-4">
          <LoadingSkeleton v-if="divLoading" type="table" :rows="8" />
          <template v-else>
            <div v-if="!dividends.length" class="py-8 text-center text-sm text-gray-400">無股利資料</div>
            <table v-else class="fund-table div-table">
              <thead>
                <tr>
                  <th>所屬期間</th><th>除息日</th><th>現金</th><th>股票</th><th>合計</th>
                  <th>除息前價</th><th>填息狀態</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in dividends" :key="`${d.year}-${d.period}`">
                  <td class="num">{{ d.year }}{{ d.period !== '1' ? ` Q${d.period}` : '' }}</td>
                  <td class="num" style="color:var(--muted)">{{ d.exDate ?? '—' }}</td>
                  <td class="num is-up">{{ d.cash > 0 ? d.cash.toFixed(2) : '—' }}</td>
                  <td class="num">{{ d.stock > 0 ? d.stock.toFixed(2) : '—' }}</td>
                  <td class="num" style="font-weight:600">{{ (d.cash + d.stock).toFixed(2) }}</td>
                  <td class="num" style="color:var(--muted)">{{ d.refPrice != null ? d.refPrice.toFixed(2) : '—' }}</td>
                  <td>
                    <span v-if="d.filled === true" class="fill-tag fill-ok">已填息 · {{ d.fillDays }} 日</span>
                    <span v-else-if="d.filled === false" class="fill-tag fill-no">未填息 {{ d.gapPct != null ? `${d.gapPct.toFixed(1)}%` : '' }}</span>
                    <span v-else class="fill-tag fill-na">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="fund-note">填息：除息後收盤價漲回除息前一日收盤即為填息；填息日數為交易日。</p>
          </template>
        </div>

        <!-- Tab: 回測 -->
        <div v-else-if="activeTab === 'backtest'" class="space-y-4">
          <div class="fund-sec">
            <div class="fund-hd">均線黃金/死亡交叉回測</div>
            <div class="bt-form">
              <AppInput v-model.number="btFastPeriod" label="快線天數" type="number" />
              <AppInput v-model.number="btSlowPeriod" label="慢線天數" type="number" />
              <AppInput v-model="btFrom" label="起始日期" placeholder="YYYY-MM-DD" />
              <AppInput v-model="btTo" label="結束日期" placeholder="YYYY-MM-DD" />
              <AppButton :loading="btLoading" @click="runBacktest">執行回測</AppButton>
            </div>
            <p class="fund-note">快線上穿慢線（黃金交叉）於次日開盤進場；下穿（死亡交叉）於次日開盤出場，避免同根K棒 look-ahead bias。</p>
            <p v-if="btError" class="fund-note is-dn">{{ btError }}</p>
          </div>

          <template v-if="btResult">
            <div class="kpi-grid">
              <div class="kpi">
                <span class="kpi-k">交易次數</span>
                <span class="kpi-v">{{ btResult.tradeCount }}</span>
              </div>
              <div class="kpi">
                <span class="kpi-k">勝率</span>
                <span class="kpi-v" :class="btResult.winRate >= 50 ? 'is-up' : 'is-dn'">{{ btResult.winRate }}</span>
                <span class="kpi-x">%</span>
              </div>
              <div class="kpi">
                <span class="kpi-k">總報酬率</span>
                <span class="kpi-v" :class="btResult.totalReturnPct >= 0 ? 'is-up' : 'is-dn'">{{ btResult.totalReturnPct }}</span>
                <span class="kpi-x">%</span>
              </div>
              <div class="kpi">
                <span class="kpi-k">最大回落</span>
                <span class="kpi-v is-dn">{{ btResult.maxDrawdownPct }}</span>
                <span class="kpi-x">%</span>
              </div>
            </div>

            <div class="fund-sec">
              <div class="fund-hd-row">
                <span class="fund-hd">交易明細</span>
                <span class="fund-hd-side">最終資金 {{ fmtValue(btResult.finalCapital) }}</span>
              </div>
              <DataTable
                :columns="btColumns"
                :data="btResult.trades"
                row-key="entryDate"
                empty-text="無交易紀錄"
              />
            </div>
          </template>
        </div>

        <!-- Tab: 籌碼分析（法人 / 融資券 / 分點） -->
        <template v-else-if="activeTab === 'chips'">
        <div class="mb-4 flex gap-1 border-b border-gray-100">
          <button
            v-for="v in chipViews"
            :key="v.key"
            class="seg"
            :class="chipView === v.key && 'seg-on'"
            @click="chipView = v.key"
          >
            {{ v.label }}
          </button>
        </div>

        <!-- 三大法人 -->
        <div
          v-if="chipView === 'institutional'"
          class="space-y-4"
        >
          <LoadingSkeleton
            v-if="isLoading && !institutionalData.length"
            type="chart"
          />
          <template v-else>
            <InstitutionalChart
              :data="institutionalData"
              :type="instType"
              :height="220"
              @update:type="instType = $event"
            />
            <DataTable
              :columns="instColumns"
              :data="institutionalData"
              row-key="date"
              empty-text="無法人資料"
            >
              <template #cell-foreignNet="{ value }">
                <span
                  :class="(value as number) >= 0 ? 'text-up' : 'text-down'"
                  class="font-mono text-xs"
                >
                  {{ fmtNet(value as number) }}
                </span>
              </template>
              <template #cell-trustNet="{ value }">
                <span
                  :class="(value as number) >= 0 ? 'text-up' : 'text-down'"
                  class="font-mono text-xs"
                >
                  {{ fmtNet(value as number) }}
                </span>
              </template>
              <template #cell-dealerNet="{ value }">
                <span
                  :class="(value as number) >= 0 ? 'text-up' : 'text-down'"
                  class="font-mono text-xs"
                >
                  {{ fmtNet(value as number) }}
                </span>
              </template>
              <template #cell-totalNet="{ value }">
                <span
                  :class="(value as number) >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'"
                  class="font-mono text-xs"
                >
                  {{ fmtNet(value as number) }}
                </span>
              </template>
            </DataTable>
          </template>
        </div>

        <!-- 融資融券 -->
        <div
          v-else-if="chipView === 'margin'"
          class="space-y-4"
        >
          <LoadingSkeleton
            v-if="isLoading && !marginData.length"
            type="chart"
          />
          <template v-else>
            <MarginChart
              :data="marginData"
              :height="220"
            />
            <DataTable
              :columns="marginColumns"
              :data="marginData"
              row-key="date"
              empty-text="無融資融券資料"
            >
              <template #cell-marginChange="{ value }">
                <span
                  :class="(value as number) >= 0 ? 'text-up' : 'text-down'"
                  class="font-mono text-xs"
                >
                  {{ (value as number) >= 0 ? '+' : '' }}{{ (value as number).toLocaleString() }}
                </span>
              </template>
              <template #cell-shortChange="{ value }">
                <span
                  :class="(value as number) >= 0 ? 'text-down' : 'text-up'"
                  class="font-mono text-xs"
                >
                  {{ (value as number) >= 0 ? '+' : '' }}{{ (value as number).toLocaleString() }}
                </span>
              </template>
              <template #cell-ratio="{ value }">
                <span class="font-mono text-xs text-gray-700">
                  {{ value != null ? `${(value as number).toFixed(1)}%` : '—' }}
                </span>
              </template>
            </DataTable>
          </template>
        </div>

        <!-- 分點進出 -->
        <div v-else>
          <div v-if="brokerLoading">
            <p class="mb-3 text-center text-xs text-gray-400">
              首次查詢需即時爬取分點資料，約需 10 秒，請稍候…
            </p>
            <LoadingSkeleton type="table" />
          </div>
          <div
            v-else-if="!broker || (!broker.topBuy.length && !broker.topSell.length)"
            class="py-8 text-center text-sm text-gray-400"
          >
            無分點資料
          </div>
          <div v-else>
            <p class="mb-2 text-xs text-gray-400">
              點分點名稱可展開價位別明細
              <span v-if="concentration" class="ml-2 text-gray-500">
                · 前 {{ concentration.topN }} 大分點集中度 <b class="text-gray-700">{{ concentration.concentrationPct }}%</b>
              </span>
            </p>
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <div class="mb-2 text-sm font-semibold text-up">買超分點</div>
                <table class="w-full text-sm">
                  <tbody>
                    <tr
                      v-for="(b, i) in broker.topBuy"
                      :key="b.brokerName"
                      class="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                      :class="expandedBroker === b.brokerName && 'bg-up-soft'"
                      @click="toggleBrokerDetail(b.brokerName)"
                    >
                      <td class="w-6 py-1.5 text-center text-xs text-gray-400">{{ i + 1 }}</td>
                      <td class="py-1.5 text-gray-700">
                        {{ fmtBroker(b.brokerName) }}
                        <span v-if="b.tag" class="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">{{ b.tag }}</span>
                      </td>
                      <td class="py-1.5 text-right font-mono text-up">{{ fmtShares(b.net) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div class="mb-2 text-sm font-semibold text-down">賣超分點</div>
                <table class="w-full text-sm">
                  <tbody>
                    <tr
                      v-for="(b, i) in broker.topSell"
                      :key="b.brokerName"
                      class="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                      :class="expandedBroker === b.brokerName && 'bg-up-soft'"
                      @click="toggleBrokerDetail(b.brokerName)"
                    >
                      <td class="w-6 py-1.5 text-center text-xs text-gray-400">{{ i + 1 }}</td>
                      <td class="py-1.5 text-gray-700">
                        {{ fmtBroker(b.brokerName) }}
                        <span v-if="b.tag" class="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">{{ b.tag }}</span>
                      </td>
                      <td class="py-1.5 text-right font-mono text-down">{{ fmtShares(b.net) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 價位別明細 -->
            <div
              v-if="expandedBroker"
              class="mt-4 rounded-lg border border-gray-100 bg-gray-50/50 p-3"
            >
              <div class="mb-2 text-sm font-semibold text-gray-700">
                {{ expandedBroker ? fmtBroker(expandedBroker) : "" }} — 價位別明細
                <span
                  v-if="streak && streak.currentStreak > 0"
                  class="ml-2 rounded px-1.5 py-0.5 text-xs font-medium"
                  :class="streak.direction === 'buy' ? 'bg-up-soft text-up' : 'bg-down-soft text-down'"
                >
                  連續{{ streak.direction === 'buy' ? '買超' : '賣超' }} {{ streak.currentStreak }} 日
                </span>
              </div>
              <LoadingSkeleton
                v-if="detailLoading"
                type="table"
                :rows="4"
              />
              <div
                v-else-if="!brokerDetail || !brokerDetail.levels.length"
                class="py-3 text-center text-xs text-gray-400"
              >
                無明細資料
              </div>
              <table
                v-else
                class="w-full text-sm"
              >
                <thead>
                  <tr class="text-xs text-gray-400">
                    <th class="py-1.5 text-left font-medium">價格</th>
                    <th class="py-1.5 text-right font-medium">買進</th>
                    <th class="py-1.5 text-right font-medium">賣出</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="lv in brokerDetail.levels"
                    :key="lv.price"
                    class="border-t border-gray-100"
                  >
                    <td class="py-1 font-mono text-gray-700">{{ lv.price.toFixed(2) }}</td>
                    <td class="py-1 text-right font-mono text-up">{{ lv.buy ? lv.buy.toLocaleString() : '—' }}</td>
                    <td class="py-1 text-right font-mono text-down">{{ lv.sell ? lv.sell.toLocaleString() : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </template>

        <!-- Tab: 相關新聞 -->
        <div v-else-if="activeTab === 'news'">
          <NewsFeed :stock-id="stockId" />
        </div>

        <!-- Tab: 重大訊息 -->
        <div v-else-if="activeTab === 'mops'">
          <NewsFeed
            :stock-id="stockId"
            category="major_announcement"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 52 週區間條 */
.w52-track {
  position: relative;
  flex: 1;
  height: 0.4rem;
  min-width: 80px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--dn-soft), var(--bg) 50%, var(--up-soft));
}
.w52-marker {
  position: absolute;
  top: 50%;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  background: var(--sf);
  border: 2px solid var(--txt);
  transform: translate(-50%, -50%);
  transition: left 0.4s ease;
}

/* 頁籤列：可橫捲、藏捲軸 */
.tab-strip { scrollbar-width: none; }
.tab-strip::-webkit-scrollbar { display: none; }

.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.div-table th, .div-table td { text-align: right; }
.div-table th:first-child, .div-table td:first-child { text-align: left; }
.div-table td:last-child, .div-table th:last-child { text-align: center; }
.fill-tag { font-size: 0.72rem; font-weight: 600; padding: 0.12rem 0.5rem; border-radius: 5px; white-space: nowrap; }
.fill-ok { color: var(--up); background: var(--up-soft); }
.fill-no { color: var(--dn); background: var(--dn-soft); }
.fill-na { color: var(--muted); }

.bt-form { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
.bt-form > * { min-width: 8rem; }
.stat-k {
  font-size: 0.7rem;
  color: #94a3b8;
}
.stat-v {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #334155;
}
</style>
