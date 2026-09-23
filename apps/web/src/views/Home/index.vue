<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMarketStore } from '@/stores/market.store'
import { IndexLineChart, HeatmapChart } from '@tw-stock-hub/charts'
import { NewsFeed, LoadingSkeleton, useStaggerIn, useCountUp } from '@tw-stock-hub/ui'
import { stockApi } from '@tw-stock-hub/api-client'
import type { InstitutionalRankingItem, MarginRankingItem, SectorStockItem } from '@tw-stock-hub/types'

type Period = '1M' | '3M' | '6M' | '1Y'

const marketStore = useMarketStore()
const { overview, heatmapData, historyData, isLoading } = storeToRefs(marketStore)

const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.card')

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
  <div ref="rootEl" class="dash -m-4 p-5 md:-m-6 md:p-7">

    <!-- ── Top bar ── -->
    <div class="topbar">
      <div class="topbar-left">
        <span class="taiex-tag">TAIEX</span>
        <span class="page-label">台灣加權指數</span>
      </div>
      <span class="update-time">每日 14:35 更新</span>
    </div>

    <!-- ── Hero ── -->
    <div v-if="isLoading && !overview" class="mb-5">
      <LoadingSkeleton type="card" />
    </div>

    <section v-else-if="overview" class="hero">
      <!-- Big index number -->
      <div class="hero-index">
        <div class="index-num" :class="overview.taiexChange >= 0 ? 'is-up' : 'is-dn'">{{ taiexCloseDisplay.toLocaleString() }}</div>
        <div class="index-change" :class="overview.taiexChange >= 0 ? 'is-up' : 'is-dn'">
          <span class="chg-arrow">{{ overview.taiexChange >= 0 ? '▲' : '▼' }}</span>
          <span>{{ Math.abs(overview.taiexChange).toFixed(2) }}</span>
          <span class="chg-pct">{{ fmtPct(overview.taiexChangePct) }}</span>
        </div>
      </div>

      <!-- Stats panel -->
      <div class="stats-panel">
        <!-- Row 1: trading stats -->
        <div class="stats-row">
          <div class="stat">
            <span class="stat-lbl">成交值</span>
            <span class="stat-val">{{ fmtValue(totalValueDisplay) }}</span>
          </div>
          <div class="stat-sep" />
          <div class="stat">
            <span class="stat-lbl">上漲</span>
            <span class="stat-val is-up">{{ upCountDisplay.toLocaleString() }}</span>
            <span class="stat-sub">漲停 {{ overview.limitUpCount }}</span>
          </div>
          <div class="stat">
            <span class="stat-lbl">下跌</span>
            <span class="stat-val is-dn">{{ downCountDisplay.toLocaleString() }}</span>
            <span class="stat-sub">跌停 {{ overview.limitDownCount }}</span>
          </div>
          <div class="stat">
            <span class="stat-lbl">平盤</span>
            <span class="stat-val is-flat">{{ overview.flatCount.toLocaleString() }}</span>
          </div>
        </div>

        <!-- Divider -->
        <div class="stats-hdivider" />

        <!-- Row 2: OHLC -->
        <div class="stats-row ohlc-row">
          <div class="stat">
            <span class="stat-lbl">昨收</span>
            <span class="stat-val">{{ fmtNum(overview.taiexPrevClose) }}</span>
          </div>
          <div class="stat">
            <span class="stat-lbl">開盤</span>
            <span class="stat-val">{{ fmtNum(overview.taiexOpen) }}</span>
          </div>
          <div class="stat">
            <span class="stat-lbl">最高</span>
            <span class="stat-val is-up">{{ fmtNum(overview.taiexHigh) }}</span>
          </div>
          <div class="stat">
            <span class="stat-lbl">最低</span>
            <span class="stat-val is-dn">{{ fmtNum(overview.taiexLow) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Main grid: charts + news ── -->
    <div class="main-grid">
      <div class="chart-col">
        <div class="card panel">
          <div class="panel-hdr">走勢圖</div>
          <LoadingSkeleton v-if="isLoading && !historyData.length" type="chart" />
          <IndexLineChart
            v-else
            :data="historyData"
            :period="period"
            :height="240"
            @period-change="onPeriodChange"
          />
        </div>
        <div class="card panel">
          <div class="panel-hdr">類股漲跌熱力圖 <span class="hint">（點類股看成份股）</span></div>
          <LoadingSkeleton v-if="!heatmapData.length" type="chart" />
          <HeatmapChart v-else :data="heatmapData" :height="220" @select="onSectorSelect" />

          <!-- 下鑽：成份股 -->
          <div v-if="selectedSector" class="sector-drill">
            <div class="drill-hdr">
              <span class="drill-title">{{ selectedSector }} 成份股</span>
              <button class="drill-close" @click="selectedSector = null">✕</button>
            </div>
            <div v-if="sectorLoading" class="drill-loading">載入中…</div>
            <div v-else-if="!sectorStocks.length" class="drill-loading">無成份股資料</div>
            <div v-else class="drill-grid">
              <router-link
                v-for="s in sectorStocks"
                :key="s.stockId"
                :to="`/stocks/${s.stockId}`"
                class="drill-item"
              >
                <span class="drill-name">{{ s.stockName }}</span>
                <span class="drill-id">{{ s.stockId }}</span>
                <span
                  class="drill-pct"
                  :class="(s.changePct ?? 0) > 0 ? 'is-up' : (s.changePct ?? 0) < 0 ? 'is-dn' : 'is-flat'"
                >{{ s.changePct == null ? '—' : `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(2)}%` }}</span>
              </router-link>
            </div>
          </div>
        </div>
      </div>

      <div class="card news-col p-0">
        <div class="news-hdr">
          <span class="panel-hdr" style="margin:0">市場最新消息</span>
        </div>
        <div class="news-body">
          <NewsFeed />
        </div>
      </div>
    </div>

    <!-- ── 底部三欄 ── -->
    <div class="bottom-grid">

      <!-- 外資動向 -->
      <div class="card panel">
        <div class="bpanel-hdr">
          <span class="bpanel-title">外資動向</span>
          <div class="tab-group">
            <button :class="['tab-btn', instTab==='buy' && 'tab-btn-active']" @click="instTab='buy'">買超</button>
            <button :class="['tab-btn', instTab==='sell' && 'tab-btn-active']" @click="instTab='sell'">賣超</button>
          </div>
        </div>
        <table class="rank-table">
          <tbody>
            <tr v-for="(item, i) in (instTab==='buy' ? foreignBuy : foreignSell)" :key="item.stockId">
              <td class="rank-no">{{ i + 1 }}</td>
              <td class="rank-info">
                <router-link :to="`/stocks/${item.stockId}`" class="rank-name">{{ item.stockName }}</router-link>
                <span class="rank-id">{{ item.stockId }}</span>
              </td>
              <td class="rank-val" :class="item.netAmount >= 0 ? 'is-up' : 'is-dn'">
                {{ fmtHundredMillion(item.netAmount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 投信動向 -->
      <div class="card panel">
        <div class="bpanel-hdr">
          <span class="bpanel-title">投信動向</span>
          <div class="tab-group">
            <button :class="['tab-btn', trustTab==='buy' && 'tab-btn-active']" @click="trustTab='buy'">買超</button>
            <button :class="['tab-btn', trustTab==='sell' && 'tab-btn-active']" @click="trustTab='sell'">賣超</button>
          </div>
        </div>
        <table class="rank-table">
          <tbody>
            <tr v-for="(item, i) in (trustTab==='buy' ? trustBuy : trustSell)" :key="item.stockId">
              <td class="rank-no">{{ i + 1 }}</td>
              <td class="rank-info">
                <router-link :to="`/stocks/${item.stockId}`" class="rank-name">{{ item.stockName }}</router-link>
                <span class="rank-id">{{ item.stockId }}</span>
              </td>
              <td class="rank-val" :class="item.netAmount >= 0 ? 'is-up' : 'is-dn'">
                {{ fmtHundredMillion(item.netAmount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 融資異動 -->
      <div class="card panel">
        <div class="bpanel-hdr">
          <span class="bpanel-title">融資異動</span>
          <div class="tab-group">
            <button :class="['tab-btn', marginTab==='increase' && 'tab-btn-active']" @click="marginTab='increase'">增加</button>
            <button :class="['tab-btn', marginTab==='decrease' && 'tab-btn-active']" @click="marginTab='decrease'">減少</button>
          </div>
        </div>
        <table class="rank-table">
          <tbody>
            <tr v-for="(item, i) in (marginTab==='increase' ? marginIncrease : marginDecrease)" :key="item.stockId">
              <td class="rank-no">{{ i + 1 }}</td>
              <td class="rank-info">
                <router-link :to="`/stocks/${item.stockId}`" class="rank-name">{{ item.stockName }}</router-link>
                <span class="rank-id">{{ item.stockId }}</span>
              </td>
              <td class="rank-val" :class="item.marginChange >= 0 ? 'is-up' : 'is-dn'">
                {{ fmtThousandShares(item.marginChange) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap');

/* ════════════════════════════════ Root */
/* 色票 token 來自全域 :root（見 DESIGN.md / main.css） */
.dash {
  background: var(--bg);
  color: var(--txt);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ════════════════════════════════ Top bar */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--bd);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.taiex-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--gold);
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.28);
  padding: 0.18rem 0.55rem;
  border-radius: 3px;
}

.page-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.update-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  color: var(--muted);
}

/* ════════════════════════════════ Hero */
.hero {
  display: flex;
  align-items: stretch;
  gap: 2rem;
  flex-wrap: wrap;
}

/* Left: big number */
.hero-index {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.35rem;
  min-width: 200px;
}

.index-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
}

.index-change {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  font-weight: 400;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.index-change.is-up, .index-num.is-up { color: var(--up); }
.index-change.is-dn, .index-num.is-dn { color: var(--dn); }

.chg-arrow { font-size: 0.875rem; }

.chg-pct {
  opacity: 0.75;
  font-size: 0.875rem;
}

/* Right: stats panel */
.stats-panel {
  flex: 1;
  min-width: 0;
  background: var(--sf);
  border: 1px solid var(--bd);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.stats-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 0.25rem;
  gap: 0;
}

.ohlc-row {
  flex-wrap: wrap;
}

.stats-hdivider {
  height: 1px;
  background: var(--bd);
  margin: 0 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.15rem 1.1rem;
  flex: 1;
}

.stat-lbl {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.stat-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  font-weight: 500;
  color: var(--txt);
  white-space: nowrap;
}

.stat-val.is-up   { color: var(--up); }
.stat-val.is-dn   { color: var(--dn); }
.stat-val.is-flat { color: var(--muted); }

.stat-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--muted);
}

.stat-sep {
  width: 1px;
  height: 2.25rem;
  background: var(--bd);
  flex-shrink: 0;
}

/* ════════════════════════════════ Main grid */
.main-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  flex: 1;
}

@media (min-width: 1024px) {
  .main-grid { grid-template-columns: 2fr 1fr; }
}

.chart-col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ════════════════════════════════ Panels */
.panel {
  background: var(--sf) !important;
  border: 1px solid var(--bd) !important;
  border-radius: 8px !important;
  padding: 1rem !important;
  box-shadow: none !important;
}

.panel-hdr {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin-bottom: 0.75rem;
  display: block;
}

.hint {
  font-weight: 400;
  font-size: 0.7rem;
  color: var(--muted);
  opacity: 0.7;
}

/* ── 熱力圖下鑽 */
.sector-drill {
  margin-top: 0.75rem;
  border-top: 1px solid var(--bd);
  padding-top: 0.75rem;
}

.drill-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.drill-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--txt);
}

.drill-close {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1;
  padding: 0.2rem;
}

.drill-close:hover { color: var(--txt); }

.drill-loading {
  font-size: 0.8rem;
  color: var(--muted);
  padding: 0.5rem 0;
}

.drill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.4rem;
  max-height: 240px;
  overflow-y: auto;
}

.drill-item {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--bd);
  border-radius: 5px;
  text-decoration: none;
  transition: background 0.15s;
}

.drill-item:hover { background: var(--bg); }

.drill-name {
  font-size: 0.8rem;
  color: var(--txt);
  font-weight: 500;
}

.drill-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: var(--muted);
}

.drill-pct {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  font-weight: 500;
}

.drill-pct.is-up   { color: var(--up); }
.drill-pct.is-dn   { color: var(--dn); }
.drill-pct.is-flat { color: var(--muted); }

/* ════════════════════════════════ News */
.news-col {
  background: var(--sf) !important;
  border: 1px solid var(--bd) !important;
  border-radius: 8px !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden;
}

.news-hdr {
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--bd);
}

.news-body {
  overflow-y: auto;
  max-height: 520px;
  flex: 1;
}

.news-body::-webkit-scrollbar { width: 3px; }
.news-body::-webkit-scrollbar-track { background: var(--bg); }
.news-body::-webkit-scrollbar-thumb { background: var(--bd); border-radius: 2px; }

/* ════════════════════════════════ Override shared .card */
:deep(.card) {
  background: var(--sf) !important;
  border: 1px solid var(--bd) !important;
  box-shadow: none !important;
}

/* ════════════════════════════════ Bottom grid */
.bottom-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 1024px) {
  .bottom-grid { grid-template-columns: repeat(3, 1fr); }
}

.bpanel-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.bpanel-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
}

.tab-group {
  display: flex;
  gap: 0.25rem;
}

.tab-btn {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  color: var(--muted);
  transition: all 0.15s;
  border: 1px solid transparent;
}

.tab-btn:hover { background: var(--bg); }

.tab-btn-active {
  background: var(--txt);
  color: #fff;
}

/* ── Rank table */
.rank-table {
  width: 100%;
  border-collapse: collapse;
}

.rank-table tr {
  border-bottom: 1px solid var(--bd);
}

.rank-table tr:last-child { border-bottom: none; }

.rank-table td {
  padding: 0.45rem 0.25rem;
  font-size: 0.875rem;
  vertical-align: middle;
}

.rank-no {
  width: 1.5rem;
  color: var(--muted);
  font-size: 0.75rem;
  text-align: center;
}

.rank-info {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.rank-name {
  font-weight: 500;
  color: var(--txt);
  text-decoration: none;
  font-size: 0.875rem;
}

.rank-name:hover { color: #2563eb; }

.rank-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--muted);
}

.rank-val {
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

.rank-val.is-up   { color: var(--up); }
.rank-val.is-dn   { color: var(--dn); }
.rank-val.is-flat { color: var(--muted); }
</style>
