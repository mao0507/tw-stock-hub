<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMarketStore } from '@/stores/market.store'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { IndexLineChart, HeatmapChart } from '@tw-stock-hub/charts'
import { LoadingSkeleton, NewsFeed, useStaggerIn, useCountUp } from '@tw-stock-hub/ui'
import { stockApi } from '@tw-stock-hub/api-client'
import type { InstitutionalRankingItem, MarginRankingItem, SectorStockItem } from '@tw-stock-hub/types'

type Period = '1M' | '3M' | '6M' | '1Y'

const marketStore = useMarketStore()
const { overview, heatmapData, historyData, isLoading } = storeToRefs(marketStore)

const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.panel')

const period = ref<Period>('3M')

const taiexCloseDisplay = useCountUp(computed(() => overview.value?.taiexClose ?? 0), 2)
const totalValueDisplay = useCountUp(computed(() => overview.value?.totalValue ?? 0))
const upCountDisplay = useCountUp(computed(() => overview.value?.upCount ?? 0))
const downCountDisplay = useCountUp(computed(() => overview.value?.downCount ?? 0))

// ── 外資排行
const foreignBuy = ref<InstitutionalRankingItem[]>([])
const foreignSell = ref<InstitutionalRankingItem[]>([])
const instTab = ref<'buy' | 'sell'>('buy')

// ── 投信排行
const trustBuy = ref<InstitutionalRankingItem[]>([])
const trustSell = ref<InstitutionalRankingItem[]>([])
const trustTab = ref<'buy' | 'sell'>('buy')

// ── 融資排行
const marginIncrease = ref<MarginRankingItem[]>([])
const marginDecrease = ref<MarginRankingItem[]>([])
const marginTab = ref<'increase' | 'decrease'>('increase')

// ── 熱力圖下鑽
const selectedSector = ref<string | null>(null)
const sectorStocks = ref<SectorStockItem[]>([])
const sectorLoading = ref(false)

async function onSectorSelect(sectorName: string): Promise<void> {
  selectedSector.value = sectorName
  sectorLoading.value = true
  sectorStocks.value = []
  try {
    const res = await stockApi.getSectorStocks(sectorName)
    sectorStocks.value = res.stocks
  } finally {
    sectorLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    marketStore.fetchOverview(),
    marketStore.fetchHeatmap(),
    marketStore.fetchHistory(period.value),
    stockApi.getInstitutionalRanking({ type: 'foreign', order: 'buy', limit: 8 }).then(r => { foreignBuy.value = r }),
    stockApi.getInstitutionalRanking({ type: 'foreign', order: 'sell', limit: 8 }).then(r => { foreignSell.value = r }),
    stockApi.getInstitutionalRanking({ type: 'trust', order: 'buy', limit: 8 }).then(r => { trustBuy.value = r }),
    stockApi.getInstitutionalRanking({ type: 'trust', order: 'sell', limit: 8 }).then(r => { trustSell.value = r }),
    stockApi.getMarginRanking({ order: 'increase', limit: 8 }).then(r => { marginIncrease.value = r }),
    stockApi.getMarginRanking({ order: 'decrease', limit: 8 }).then(r => { marginDecrease.value = r }),
  ])
})

async function onPeriodChange(p: Period): Promise<void> {
  period.value = p
  await marketStore.fetchHistory(p)
}

// 手機熱力圖格子太小 → 改排序清單
const isDesktop = useMediaQuery('(min-width: 768px)')
const sectorsSorted = computed(() => [...heatmapData.value].sort((a, b) => b.changePct - a.changePct))
const sectorMax = computed(() => Math.max(0.01, ...heatmapData.value.map(s => Math.abs(s.changePct))))

// 漲跌家數比例條
const breadth = computed(() => {
  const o = overview.value
  if (!o) return null
  const total = o.upCount + o.flatCount + o.downCount || 1
  return {
    up: (o.upCount / total) * 100,
    flat: (o.flatCount / total) * 100,
    down: (o.downCount / total) * 100,
  }
})

// 底部三張排行看板
const rankPanels = computed(() => [
  {
    title: '外資動向',
    tab: instTab.value,
    set: (t: string) => { instTab.value = t as 'buy' | 'sell' },
    tabs: [['buy', '買超'], ['sell', '賣超']] as const,
    rows: (instTab.value === 'buy' ? foreignBuy.value : foreignSell.value)
      .map(r => ({ id: r.stockId, name: r.stockName, v: r.netAmount, text: fmtHundredMillion(r.netAmount) })),
  },
  {
    title: '投信動向',
    tab: trustTab.value,
    set: (t: string) => { trustTab.value = t as 'buy' | 'sell' },
    tabs: [['buy', '買超'], ['sell', '賣超']] as const,
    rows: (trustTab.value === 'buy' ? trustBuy.value : trustSell.value)
      .map(r => ({ id: r.stockId, name: r.stockName, v: r.netAmount, text: fmtHundredMillion(r.netAmount) })),
  },
  {
    title: '融資異動',
    tab: marginTab.value,
    set: (t: string) => { marginTab.value = t as 'increase' | 'decrease' },
    tabs: [['increase', '增加'], ['decrease', '減少']] as const,
    rows: (marginTab.value === 'increase' ? marginIncrease.value : marginDecrease.value)
      .map(r => ({ id: r.stockId, name: r.stockName, v: r.marginChange, text: fmtThousandShares(r.marginChange) })),
  },
])

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtValue(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 兆`
  if (v >= 1e8) return `${(v / 1e8).toFixed(0)} 億`
  return v.toLocaleString()
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtHundredMillion(v: number): string {
  const b = v / 1e8
  return `${b >= 0 ? '+' : ''}${b.toFixed(1)}億`
}

function fmtThousandShares(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v / 1000).toFixed(0)}張`
}
</script>

<template>
  <div
    ref="rootEl"
    class="flex flex-col gap-5"
  >
    <!-- 報頭 -->
    <header class="page-head">
      <div>
        <h1 class="page-head-title">
          今日市場
        </h1>
        <p class="page-head-sub">
          {{ overview ? `${overview.date} · 盤後資料` : 'TAIEX' }}
        </p>
      </div>
      <span class="page-head-meta">每日 14:35 更新</span>
    </header>

    <div
      v-if="isLoading && !overview"
      class="panel p-5"
    >
      <LoadingSkeleton type="card" />
    </div>

    <!-- 加權指數 -->
    <section
      v-else-if="overview"
      class="panel hero"
    >
      <div class="hero-main">
        <div class="flex items-center gap-2">
          <span class="taiex-tag">TAIEX</span>
          <span class="text-sm text-gray-500">台灣加權指數</span>
        </div>
        <div
          class="index-num"
          :class="overview.taiexChange >= 0 ? 'is-up' : 'is-dn'"
        >
          {{ taiexCloseDisplay.toLocaleString() }}
        </div>
        <div
          class="index-change"
          :class="overview.taiexChange >= 0 ? 'is-up' : 'is-dn'"
        >
          <span>{{ overview.taiexChange >= 0 ? '▲' : '▼' }} {{ Math.abs(overview.taiexChange).toFixed(2) }}</span>
          <span class="chg-pct">{{ fmtPct(overview.taiexChangePct) }}</span>
        </div>

        <!-- 漲跌家數比例 -->
        <div
          v-if="breadth"
          class="mt-4"
        >
          <div
            class="breadth"
            role="img"
            :aria-label="`上漲 ${overview.upCount} 家，平盤 ${overview.flatCount} 家，下跌 ${overview.downCount} 家`"
          >
            <span
              class="bg-up"
              :style="{ width: `${breadth.up}%` }"
            />
            <span
              class="bg-gray-300"
              :style="{ width: `${breadth.flat}%` }"
            />
            <span
              class="bg-down"
              :style="{ width: `${breadth.down}%` }"
            />
          </div>
          <div class="mt-1.5 flex justify-between font-mono text-xs">
            <span class="is-up">▲ {{ upCountDisplay.toLocaleString() }} 家</span>
            <span class="is-flat">平 {{ overview.flatCount.toLocaleString() }}</span>
            <span class="is-dn">▼ {{ downCountDisplay.toLocaleString() }} 家</span>
          </div>
        </div>
      </div>

      <dl class="hero-stats">
        <div class="stat-cell">
          <dt class="stat-k">
            成交值
          </dt>
          <dd class="stat-v">
            {{ fmtValue(totalValueDisplay) }}
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            上漲／漲停
          </dt>
          <dd class="stat-v is-up">
            {{ overview.upCount.toLocaleString() }} <span class="stat-sub">／{{ overview.limitUpCount }}</span>
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            下跌／跌停
          </dt>
          <dd class="stat-v is-dn">
            {{ overview.downCount.toLocaleString() }} <span class="stat-sub">／{{ overview.limitDownCount }}</span>
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            平盤
          </dt>
          <dd class="stat-v is-flat">
            {{ overview.flatCount.toLocaleString() }}
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            昨收
          </dt>
          <dd class="stat-v">
            {{ fmtNum(overview.taiexPrevClose) }}
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            開盤
          </dt>
          <dd class="stat-v">
            {{ fmtNum(overview.taiexOpen) }}
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            最高
          </dt>
          <dd class="stat-v is-up">
            {{ fmtNum(overview.taiexHigh) }}
          </dd>
        </div>
        <div class="stat-cell">
          <dt class="stat-k">
            最低
          </dt>
          <dd class="stat-v is-dn">
            {{ fmtNum(overview.taiexLow) }}
          </dd>
        </div>
      </dl>
    </section>

    <!-- 走勢 + 類股 -->
    <div class="grid gap-5 xl:grid-cols-5">
      <section class="panel xl:col-span-2">
        <div class="panel-hd">
          <h2 class="panel-title">
            指數走勢
          </h2>
          <span class="panel-tag">TAIEX</span>
        </div>
        <div class="p-4">
          <LoadingSkeleton
            v-if="isLoading && !historyData.length"
            type="chart"
          />
          <IndexLineChart
            v-else
            :data="historyData"
            :period="period"
            :height="260"
            @period-change="onPeriodChange"
          />
        </div>
      </section>

      <section class="panel xl:col-span-3">
        <div class="panel-hd">
          <h2 class="panel-title">
            類股強弱
          </h2>
          <span class="text-xs text-gray-500">點類股看成份股</span>
        </div>
        <div class="p-4">
          <LoadingSkeleton
            v-if="!heatmapData.length"
            type="chart"
          />
          <ul
            v-else-if="!isDesktop"
            class="sector-list"
          >
            <li
              v-for="s in sectorsSorted"
              :key="s.sectorName"
            >
              <button
                type="button"
                class="sector-row"
                :aria-pressed="selectedSector === s.sectorName"
                @click="onSectorSelect(s.sectorName)"
              >
                <span class="truncate text-sm text-gray-900">{{ s.sectorName.replace('類指數', '') }}</span>
                <span class="sector-bar">
                  <span
                    :class="s.changePct >= 0 ? 'bg-up' : 'bg-down'"
                    :style="{ width: `${(Math.abs(s.changePct) / sectorMax) * 100}%` }"
                  />
                </span>
                <span
                  class="w-16 text-right font-mono text-sm"
                  :class="s.changePct > 0 ? 'is-up' : s.changePct < 0 ? 'is-dn' : 'is-flat'"
                >{{ s.changePct > 0 ? '+' : '' }}{{ s.changePct.toFixed(2) }}%</span>
              </button>
            </li>
          </ul>
          <HeatmapChart
            v-else
            :data="heatmapData"
            :height="300"
            @select="onSectorSelect"
          />

          <!-- 下鑽：成份股 -->
          <div
            v-if="selectedSector"
            class="sector-drill"
          >
            <div class="mb-2.5 flex items-center justify-between">
              <span class="text-sm font-bold text-gray-900">{{ selectedSector }} 成份股</span>
              <button
                type="button"
                class="btn-ghost min-h-[36px] px-3 text-xs"
                @click="selectedSector = null"
              >
                關閉
              </button>
            </div>
            <div
              v-if="sectorLoading"
              class="py-2 text-sm text-gray-500"
            >
              載入中…
            </div>
            <div
              v-else-if="!sectorStocks.length"
              class="py-2 text-sm text-gray-500"
            >
              無成份股資料
            </div>
            <div
              v-else
              class="drill-grid"
            >
              <router-link
                v-for="s in sectorStocks"
                :key="s.stockId"
                :to="`/stocks/${s.stockId}`"
                class="drill-item"
              >
                <span class="text-sm font-medium text-gray-900">{{ s.stockName }}</span>
                <span class="font-mono text-xs text-gray-500">{{ s.stockId }}</span>
                <span
                  class="ml-auto font-mono text-xs font-medium"
                  :class="(s.changePct ?? 0) > 0 ? 'is-up' : (s.changePct ?? 0) < 0 ? 'is-dn' : 'is-flat'"
                >{{ s.changePct == null ? '—' : `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(2)}%` }}</span>
              </router-link>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 法人／融資排行 -->
    <div class="grid gap-5 lg:grid-cols-3">
      <section
        v-for="p in rankPanels"
        :key="p.title"
        class="panel"
      >
        <div class="panel-hd items-center">
          <h2 class="panel-title">
            {{ p.title }}
          </h2>
          <div
            class="bs-toggle"
            role="tablist"
          >
            <button
              v-for="[key, label] in p.tabs"
              :key="key"
              type="button"
              role="tab"
              :aria-selected="p.tab === key"
              class="bs"
              :class="p.tab === key && (key === 'buy' || key === 'increase' ? 'bs-buy' : 'bs-sell')"
              @click="p.set(key)"
            >
              {{ label }}
            </button>
          </div>
        </div>
        <ol class="px-4 pb-2">
          <li
            v-for="(item, i) in p.rows"
            :key="item.id"
          >
            <router-link
              :to="`/stocks/${item.id}`"
              class="rank-row"
            >
              <span class="w-5 font-mono text-xs text-gray-500">{{ i + 1 }}</span>
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-[15px] font-medium text-gray-900">{{ item.name }}</span>
                <span class="font-mono text-xs text-gray-500">{{ item.id }}</span>
              </span>
              <span
                class="ml-auto whitespace-nowrap font-mono text-sm font-medium"
                :class="item.v >= 0 ? 'is-up' : 'is-dn'"
              >{{ item.text }}</span>
            </router-link>
          </li>
          <li
            v-if="!p.rows.length"
            class="py-6 text-center text-sm text-gray-500"
          >
            暫無資料
          </li>
        </ol>
      </section>
    </div>

    <!-- 新聞 -->
    <div class="grid gap-5 lg:grid-cols-2">
      <section class="panel">
        <div class="panel-hd">
          <h2 class="panel-title">
            市場新聞
          </h2>
          <span class="panel-tag">NEWS</span>
        </div>
        <div class="max-h-[520px] overflow-y-auto">
          <NewsFeed :page-size="10" />
        </div>
      </section>
      <section class="panel">
        <div class="panel-hd">
          <h2 class="panel-title">
            重大訊息
          </h2>
          <span class="panel-tag">MOPS</span>
        </div>
        <div class="max-h-[520px] overflow-y-auto">
          <NewsFeed
            category="major_announcement"
            :page-size="10"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hero {
  display: grid;
  gap: 1.5rem;
  padding: 1.5rem;
}
@media (min-width: 1024px) {
  .hero { grid-template-columns: minmax(280px, 2fr) 3fr; gap: 2.5rem; padding: 1.75rem 2rem; }
}

.hero-main { display: flex; flex-direction: column; gap: 0.35rem; }

.taiex-tag {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--gold);
  border: 1px solid rgba(183, 121, 31, 0.35);
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
}

.index-num {
  font-family: var(--font-mono);
  font-size: clamp(2.6rem, 9vw, 3.75rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.05;
  margin-top: 0.4rem;
  font-variant-numeric: tabular-nums;
}
.index-change {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 500;
  display: flex;
  gap: 0.6rem;
}
.chg-pct { opacity: 0.8; }

.breadth {
  display: flex;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  gap: 2px;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem 1.25rem;
  align-content: center;
}
@media (min-width: 640px) {
  .hero-stats { grid-template-columns: repeat(4, 1fr); }
}
@media (min-width: 1024px) {
  .hero-stats { border-left: 1px solid var(--bd); padding-left: 2.5rem; row-gap: 1.5rem; }
}
.hero-stats .stat-v { font-size: 1.1rem; white-space: nowrap; }
.stat-sub { font-size: 0.8rem; opacity: 0.75; }

.sector-drill {
  margin-top: 1rem;
  border-top: 1px solid var(--bd);
  padding-top: 0.9rem;
}
.drill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.5rem;
  max-height: 260px;
  overflow-y: auto;
}
.drill-item {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-height: 40px;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--bd);
  border-radius: 10px;
  transition: background 0.15s;
}
.drill-item:hover { background: var(--bg); }

.sector-list { max-height: 420px; overflow-y: auto; }
.sector-row {
  display: grid;
  grid-template-columns: minmax(0, 7rem) 1fr auto;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 44px;
  border-bottom: 1px solid var(--bd-soft);
  text-align: left;
}
.sector-row[aria-pressed='true'] { background: #faf7f1; }
.sector-bar { height: 6px; border-radius: 999px; background: var(--bd-soft); overflow: hidden; }
.sector-bar > span { display: block; height: 100%; border-radius: 999px; }

.rank-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 52px;
  padding: 0.35rem 0.25rem;
  border-bottom: 1px solid var(--bd-soft);
  transition: background 0.15s;
}
li:last-child > .sector-list { max-height: 420px; overflow-y: auto; }
.sector-row {
  display: grid;
  grid-template-columns: minmax(0, 7rem) 1fr auto;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 44px;
  border-bottom: 1px solid var(--bd-soft);
  text-align: left;
}
.sector-row[aria-pressed='true'] { background: #faf7f1; }
.sector-bar { height: 6px; border-radius: 999px; background: var(--bd-soft); overflow: hidden; }
.sector-bar > span { display: block; height: 100%; border-radius: 999px; }

.rank-row { border-bottom: none; }
.rank-row:hover { background: #faf7f1; }
</style>
