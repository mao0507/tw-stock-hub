<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi } from '@tw-stock-hub/api-client'
import type { MarginRankingItem, HighRatioItem, Market } from '@tw-stock-hub/types'
import { LoadingSkeleton, useStaggerIn } from '@tw-stock-hub/ui'

const router = useRouter()
const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.fade-card')

type TabKey = 'ranking' | 'ratio'
const activeTab = ref<TabKey>('ranking')
const market = ref<Market>('ALL')

const rankingData = ref<MarginRankingItem[]>([])
const rankingLoading = ref(false)
const rankingOrder = ref<'increase' | 'decrease'>('increase')

const highRatioData = ref<HighRatioItem[]>([])
const highRatioLoading = ref(false)
const ratioThreshold = ref(30)

const markets: { label: string; value: Market }[] = [
  { label: '全部', value: 'ALL' },
  { label: '上市', value: 'TWSE' },
  { label: '上櫃', value: 'TPEX' },
]
const thresholds = [20, 30, 40, 50]

const maxChange = computed(() =>
  Math.max(1, ...rankingData.value.map(d => Math.abs(d.marginChange))),
)
const ranked = computed(() =>
  rankingData.value.map((d, i) => ({ ...d, rank: i + 1, w: (Math.abs(d.marginChange) / maxChange.value) * 100 })),
)

async function loadRanking(): Promise<void> {
  rankingLoading.value = true
  try {
    rankingData.value = await stockApi.getMarginRanking({
      order: rankingOrder.value, market: market.value, limit: 30,
    })
  } finally {
    rankingLoading.value = false
  }
}
async function loadHighRatio(): Promise<void> {
  highRatioLoading.value = true
  try {
    highRatioData.value = await stockApi.getHighRatioStocks({
      threshold: ratioThreshold.value, market: market.value, limit: 30,
    })
  } finally {
    highRatioLoading.value = false
  }
}

function reloadActive(): void {
  if (activeTab.value === 'ranking') void loadRanking()
  else void loadHighRatio()
}

onMounted(reloadActive)
watch([activeTab, market], reloadActive)
watch(rankingOrder, () => { if (activeTab.value === 'ranking') void loadRanking() })
watch(ratioThreshold, () => { if (activeTab.value === 'ratio') void loadHighRatio() })

function go(id: string): void {
  void router.push({ name: 'stock-detail', params: { id } })
}
function fmtChange(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toLocaleString()}張`
}
function ratioClass(r: number): string {
  return r >= 50 ? 'is-up' : r >= 30 ? 'is-gold' : ''
}
</script>

<template>
  <div ref="rootEl" class="mg -m-4 p-5 md:-m-6 md:p-7">

    <header class="page-head">
      <div>
        <h1 class="page-head-title">融資融券</h1>
        <div class="page-head-sub">MARGIN&nbsp;&amp;&nbsp;SHORT</div>
      </div>
      <div class="page-head-meta">融資增減排行 · 高券資比警示</div>
    </header>

    <div class="bar fade-card">
      <div class="pill-group">
        <button
          v-for="m in markets"
          :key="m.value"
          :class="['pill', market === m.value && 'pill-on']"
          @click="market = m.value"
        >{{ m.label }}</button>
      </div>
    </div>

    <!-- Tab 切換 -->
    <div class="tabs fade-card">
      <button :class="['tab', activeTab === 'ranking' && 'tab-on']" @click="activeTab = 'ranking'">融資增減排行</button>
      <button :class="['tab', activeTab === 'ratio' && 'tab-on']" @click="activeTab = 'ratio'">高券資比警示</button>
    </div>

    <!-- 融資增減排行 -->
    <section v-if="activeTab === 'ranking'" class="panel fade-card">
      <div class="panel-hd">
        <span class="panel-title">融資增減排行</span>
        <div class="bs-toggle">
          <button :class="['bs', rankingOrder === 'increase' && 'bs-buy']" @click="rankingOrder = 'increase'">增加</button>
          <button :class="['bs', rankingOrder === 'decrease' && 'bs-sell']" @click="rankingOrder = 'decrease'">減少</button>
        </div>
      </div>

      <LoadingSkeleton v-if="rankingLoading" type="table" :rows="12" />
      <div v-else-if="!ranked.length" class="empty">目前無融資資料</div>
      <div v-else class="rows">
        <div class="row row-head">
          <span class="rk">#</span>
          <span>標的</span>
          <span class="th-flow">增減強弱</span>
          <span class="th-r">融資增減</span>
          <span class="th-r">餘額 · 收盤</span>
        </div>
        <div v-for="row in ranked" :key="row.stockId" class="row" @click="go(row.stockId)">
          <span class="rk" :class="row.rank <= 3 && 'rk-top'">{{ row.rank }}</span>
          <div class="name">
            <span class="nm">{{ row.stockName }}</span>
            <span class="id num">{{ row.stockId }}</span>
          </div>
          <div class="bar-wrap">
            <div class="flow-bar" :class="row.marginChange >= 0 ? 'flow-up' : 'flow-dn'" :style="{ width: `${row.w}%` }" />
          </div>
          <span class="val num" :class="row.marginChange >= 0 ? 'is-up' : 'is-dn'">{{ fmtChange(row.marginChange) }}</span>
          <span class="sub num">餘 {{ row.marginBalance.toLocaleString() }}張 · {{ row.latestClose.toFixed(2) }}</span>
        </div>
      </div>
    </section>

    <!-- 高券資比 -->
    <section v-else class="panel fade-card">
      <div class="panel-hd">
        <span class="panel-title">高券資比警示</span>
        <div class="pill-group">
          <button
            v-for="t in thresholds"
            :key="t"
            :class="['pill', ratioThreshold === t && 'pill-on']"
            @click="ratioThreshold = t"
          >≥{{ t }}%</button>
        </div>
      </div>

      <LoadingSkeleton v-if="highRatioLoading" type="table" :rows="6" />
      <div v-else-if="!highRatioData.length" class="empty">無券資比 ≥ {{ ratioThreshold }}% 的股票</div>
      <div v-else class="rows">
        <div class="row row-head">
          <span class="rk">#</span>
          <span>標的</span>
          <span class="th-flow">券資比</span>
          <span class="th-r">券資比</span>
          <span class="th-r">券 / 資</span>
        </div>
        <div v-for="(row, i) in highRatioData" :key="row.stockId" class="row" @click="go(row.stockId)">
          <span class="rk" :class="i < 3 && 'rk-top'">{{ i + 1 }}</span>
          <div class="name">
            <span class="nm">{{ row.stockName }}</span>
            <span class="id num">{{ row.stockId }}</span>
          </div>
          <div class="bar-wrap">
            <div class="flow-bar flow-up" :style="{ width: `${Math.min(100, row.ratio)}%` }" />
          </div>
          <span class="val num" :class="ratioClass(row.ratio)">{{ row.ratio.toFixed(1) }}%</span>
          <span class="sub num">券 {{ row.shortBalance.toLocaleString() }} / 資 {{ row.marginBalance.toLocaleString() }}張</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

.mg {
  background: var(--bg);
  min-height: 100vh;
  color: var(--txt);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.bar {
  background: var(--sf);
  border: 1px solid var(--bd);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
}
.pill-group { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.empty { padding: 2.5rem; text-align: center; color: var(--muted); font-size: 0.85rem; }

.tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--bd); }
.tab {
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.5rem 0.25rem;
  margin-bottom: -1px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.tab:hover { color: var(--txt); }
.tab-on { color: var(--txt); border-bottom-color: var(--up); }

.rows { display: flex; flex-direction: column; }
.row {
  display: grid;
  grid-template-columns: 2rem 180px 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.12s;
}
.row-head {
  cursor: default;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--muted);
  background: #fafbfc;
}
.row-head:hover { background: #fafbfc; }
.row-head .th-r { text-align: right; min-width: 5.5rem; }
.row-head .th-r:last-child { min-width: 11rem; padding-left: 1rem; }
.row:last-child { border-bottom: none; }
.row:hover { background: var(--bg); }

.rk { font-family: var(--font-mono); font-size: 0.8rem; font-weight: 600; color: var(--muted); text-align: center; }
.rk-top { color: var(--up); }
.name { display: flex; flex-direction: column; min-width: 0; }
.nm { font-size: 0.88rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.id { font-size: 0.68rem; color: var(--muted); }
.bar-wrap { height: 1.1rem; display: flex; align-items: center; }
.val { font-size: 0.85rem; font-weight: 600; text-align: right; white-space: nowrap; min-width: 5.5rem; }
.is-gold { color: var(--gold); }
.sub { display: none; font-size: 0.66rem; color: var(--muted); text-align: right; white-space: nowrap; padding-left: 1rem; min-width: 11rem; }
@media (min-width: 768px) { .sub { display: block; } }
</style>
