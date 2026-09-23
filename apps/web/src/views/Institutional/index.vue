<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi } from '@tw-stock-hub/api-client'
import type { InstitutionalRankingItem, ContinuousItem, Market } from '@tw-stock-hub/types'
import { LoadingSkeleton, useStaggerIn } from '@tw-stock-hub/ui'

type InstType = 'foreign' | 'trust' | 'dealer' | 'total'
type OrderType = 'buy' | 'sell'

const router = useRouter()
const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.fade-card')

type TabKey = 'ranking' | 'continuous'

// 共用狀態：法人別 + 多空 + 市場，連動兩個分頁
const activeTab = ref<TabKey>('ranking')
const market = ref<Market>('ALL')
const instType = ref<InstType>('total')
const orderType = ref<OrderType>('buy')

const rankingData = ref<InstitutionalRankingItem[]>([])
const rankingLoading = ref(false)

const continuousData = ref<ContinuousItem[]>([])
const continuousLoading = ref(false)
const continuousDays = ref(3)

const markets: { label: string; value: Market }[] = [
  { label: '全部', value: 'ALL' },
  { label: '上市', value: 'TWSE' },
  { label: '上櫃', value: 'TPEX' },
]
const instTypes: { label: string; value: InstType }[] = [
  { label: '三大合計', value: 'total' },
  { label: '外資', value: 'foreign' },
  { label: '投信', value: 'trust' },
  { label: '自營商', value: 'dealer' },
]
const daysOptions = Array.from({ length: 9 }, (_, i) => i + 2)

// 法人買賣超為股數 → 顯示張（1000 股）
function fmtLots(v: number): string {
  const lots = Math.round(v / 1000)
  const abs = Math.abs(lots)
  const sign = lots > 0 ? '+' : lots < 0 ? '' : ''
  if (abs >= 1e4) return `${sign}${(lots / 1e4).toFixed(1)}萬張`
  return `${sign}${lots.toLocaleString()}張`
}
function fmtPlain(v: number): string {
  const lots = Math.round(Math.abs(v) / 1000)
  if (lots >= 1e4) return `${(lots / 1e4).toFixed(1)}萬張`
  return `${lots.toLocaleString()}張`
}

const maxNet = computed(() =>
  Math.max(1, ...rankingData.value.map(d => Math.abs(d.netAmount))),
)
const ranked = computed(() =>
  rankingData.value.map((d, i) => ({ ...d, rank: i + 1, w: (Math.abs(d.netAmount) / maxNet.value) * 100 })),
)

async function loadRanking(): Promise<void> {
  rankingLoading.value = true
  try {
    rankingData.value = await stockApi.getInstitutionalRanking({
      market: market.value, type: instType.value, order: orderType.value, limit: 30,
    })
  } finally {
    rankingLoading.value = false
  }
}

async function loadContinuous(): Promise<void> {
  continuousLoading.value = true
  try {
    continuousData.value = await stockApi.getInstitutionalContinuous({
      days: continuousDays.value, direction: orderType.value,
      type: instType.value, market: market.value,
    })
  } finally {
    continuousLoading.value = false
  }
}

function reloadActive(): void {
  if (activeTab.value === 'ranking') void loadRanking()
  else void loadContinuous()
}

onMounted(reloadActive)
// 法人別 / 多空 / 市場連動：切換時重載當前分頁
watch([market, instType, orderType], reloadActive)
watch(continuousDays, () => { if (activeTab.value === 'continuous') void loadContinuous() })
watch(activeTab, reloadActive)

function go(id: string): void {
  void router.push({ name: 'stock-detail', params: { id } })
}
</script>

<template>
  <div ref="rootEl" class="inst -m-4 p-5 md:-m-6 md:p-7">

    <!-- Header -->
    <header class="head">
      <div>
        <h1 class="head-title">法人動向</h1>
        <div class="head-sub">INSTITUTIONAL&nbsp;FLOW</div>
      </div>
      <div class="head-meta">
        三大法人單日買賣超 · 連續進出追蹤
      </div>
    </header>

    <!-- Control bar：法人別 + 市場 + 多空（共用、連動兩分頁） -->
    <div class="controls fade-card">
      <div class="seg-group">
        <button
          v-for="t in instTypes"
          :key="t.value"
          :class="['seg', instType === t.value && 'seg-on']"
          @click="instType = t.value"
        >{{ t.label }}</button>
      </div>
      <div class="ctrl-right">
        <div class="pill-group">
          <button
            v-for="m in markets"
            :key="m.value"
            :class="['pill', market === m.value && 'pill-on']"
            @click="market = m.value"
          >{{ m.label }}</button>
        </div>
        <div class="bs-group">
          <button :class="['bs', orderType === 'buy' && 'bs-buy']" @click="orderType = 'buy'">
            {{ activeTab === 'ranking' ? '買超' : '連買' }}
          </button>
          <button :class="['bs', orderType === 'sell' && 'bs-sell']" @click="orderType = 'sell'">
            {{ activeTab === 'ranking' ? '賣超' : '連賣' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 切換 -->
    <div class="tabs fade-card">
      <button :class="['tab', activeTab === 'ranking' && 'tab-on']" @click="activeTab = 'ranking'">買賣超排行</button>
      <button :class="['tab', activeTab === 'continuous' && 'tab-on']" @click="activeTab = 'continuous'">連續買賣追蹤</button>
    </div>

    <!-- 買賣超排行 -->
    <section v-if="activeTab === 'ranking'" class="board fade-card">
      <div class="board-hd">
        <span class="board-title">{{ orderType === 'buy' ? '買超' : '賣超' }}排行</span>
        <span class="board-tag">{{ instTypes.find(t => t.value === instType)?.label }} · TOP 30</span>
      </div>

      <LoadingSkeleton v-if="rankingLoading" type="table" :rows="12" />
      <div v-else-if="!ranked.length" class="empty">目前無排行資料</div>
      <div v-else class="rows">
        <div class="row row-head">
          <span class="rk">#</span>
          <span>標的</span>
          <span class="th-flow">買賣超強弱</span>
          <span class="th-r">淨買超</span>
          <span class="th-r">買 / 賣</span>
        </div>
        <div
          v-for="row in ranked"
          :key="row.stockId"
          class="row"
          @click="go(row.stockId)"
        >
          <span class="rk" :class="row.rank <= 3 && 'rk-top'">{{ row.rank }}</span>
          <div class="name">
            <span class="nm">{{ row.stockName }}</span>
            <span class="id">{{ row.stockId }}</span>
          </div>
          <div class="bar-wrap">
            <div
              class="bar"
              :class="row.netAmount >= 0 ? 'bar-up' : 'bar-dn'"
              :style="{ width: `${row.w}%` }"
            />
          </div>
          <span class="net" :class="row.netAmount >= 0 ? 'is-up' : 'is-dn'">{{ fmtLots(row.netAmount) }}</span>
          <span class="bsv">
            <span class="bsv-b">買 {{ fmtPlain(row.buyAmount) }}</span>
            <span class="bsv-s">賣 {{ fmtPlain(row.sellAmount) }}</span>
          </span>
        </div>
      </div>
    </section>

    <!-- 連續買賣追蹤 -->
    <section v-else class="board fade-card">
      <div class="board-hd">
        <span class="board-title">連續{{ orderType === 'buy' ? '買' : '賣' }}超追蹤</span>
        <span class="board-tag">{{ continuousData.length }} 檔</span>
      </div>

      <div class="streak-ctrl">
        <span class="streak-ctrl-lbl">連續天數</span>
        <div class="pill-group">
          <button
            v-for="d in daysOptions"
            :key="d"
            :class="['pill', continuousDays === d && 'pill-on']"
            @click="continuousDays = d"
          >{{ d }}日</button>
        </div>
      </div>

      <LoadingSkeleton v-if="continuousLoading" type="table" :rows="4" />
      <div v-else-if="!continuousData.length" class="empty">
        無連{{ orderType === 'buy' ? '買' : '賣' }} {{ continuousDays }} 日以上的股票
      </div>
      <div v-else class="streak-grid">
        <div
          v-for="s in continuousData"
          :key="s.stockId"
          class="streak"
          @click="go(s.stockId)"
        >
          <div class="streak-top">
            <span class="nm">{{ s.stockName }}</span>
            <span class="id">{{ s.stockId }}</span>
          </div>
          <div class="streak-mid">
            <span class="flame" :class="orderType === 'buy' ? 'flame-up' : 'flame-dn'">
              {{ orderType === 'buy' ? '▲' : '▼' }} 連{{ orderType === 'buy' ? '買' : '賣' }} {{ s.continuousDays }} 日
            </span>
          </div>
          <div class="streak-bot">
            <span class="streak-net" :class="s.totalNet >= 0 ? 'is-up' : 'is-dn'">{{ fmtLots(s.totalNet) }}</span>
            <span class="streak-close">{{ s.latestClose.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

/* 色票 token 來自全域 :root（見 DESIGN.md / main.css） */
.inst {
  background: var(--bg);
  min-height: 100vh;
  color: var(--txt);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Header */
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 2px solid var(--txt);
  padding-bottom: 0.75rem;
}
.head-title {
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1;
}
.head-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  letter-spacing: 0.35em;
  color: var(--muted);
  margin-top: 0.4rem;
}
.head-meta {
  font-size: 0.8rem;
  color: var(--muted);
}

/* Controls */
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: var(--sf);
  border: 1px solid var(--bd);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
}
.ctrl-right { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }

.seg-group { display: flex; gap: 0.15rem; }
.seg {
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.seg:hover { color: var(--txt); }
.seg-on { color: var(--txt); border-bottom-color: var(--up); }
.seg-group.sm .seg { font-size: 0.75rem; padding: 0.25rem 0.5rem; }

.pill-group { display: flex; gap: 0.25rem; }
.pill {
  font-size: 0.78rem;
  font-weight: 500;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  color: var(--muted);
  border: 1px solid var(--bd);
  transition: all 0.15s;
}
.pill:hover { background: var(--bg); }
.pill-on { background: var(--txt); color: #fff; border-color: var(--txt); }

.bs-group { display: flex; border: 1px solid var(--bd); border-radius: 8px; overflow: hidden; }
.bs {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.35rem 0.9rem;
  color: var(--muted);
  background: var(--sf);
  transition: all 0.15s;
}
.bs-buy { background: var(--up); color: #fff; }
.bs-sell { background: var(--dn); color: #fff; }

/* Board */
.board {
  background: var(--sf);
  border: 1px solid var(--bd);
  border-radius: 12px;
  overflow: hidden;
}
.board-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--bd);
}
.board-title { font-size: 0.95rem; font-weight: 700; }
.board-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: var(--muted);
}
.empty { padding: 2.5rem; text-align: center; color: var(--muted); font-size: 0.85rem; }

/* Tabs */
.tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--bd);
}
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

.streak-ctrl-lbl { font-size: 0.78rem; color: var(--muted); font-weight: 500; }

/* Flow rows */
.rows { display: flex; flex-direction: column; }
.row-head {
  cursor: default;
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--muted);
  background: #fafbfc;
}
.row-head:hover { background: #fafbfc; }
.row-head .th-r { text-align: right; min-width: 5.5rem; }
.row-head .th-r:last-child { min-width: 6.5rem; padding-left: 1rem; }
.row-head .th-flow { padding-left: 0.1rem; }
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
.row:last-child { border-bottom: none; }
.row:hover { background: var(--bg); }

.rk {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-align: center;
}
.rk-top { color: var(--up); }

.name { display: flex; flex-direction: column; min-width: 0; }
.nm { font-size: 0.88rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.id { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: var(--muted); }

.bar-wrap { height: 1.1rem; display: flex; align-items: center; }
.bar { height: 0.7rem; border-radius: 3px; min-width: 2px; transition: width 0.4s ease; }
.bar-up { background: linear-gradient(90deg, rgba(230,57,80,0.45), var(--up)); }
.bar-dn { background: linear-gradient(90deg, rgba(16,183,122,0.45), var(--dn)); }

.net {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  min-width: 5.5rem;
}
.is-up { color: var(--up); }
.is-dn { color: var(--dn); }

.bsv {
  display: none;
  flex-direction: column;
  gap: 0.2rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.66rem;
  text-align: right;
  line-height: 1.5;
  padding-left: 1rem;
  min-width: 6.5rem;
}
.bsv-b { color: var(--up); opacity: 0.8; }
.bsv-s { color: var(--dn); opacity: 0.8; }
@media (min-width: 768px) { .bsv { display: flex; } }

/* Streak */
.streak-ctrl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--bd);
}
.streak-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.6rem;
  padding: 1rem;
}
.streak {
  border: 1px solid var(--bd);
  border-radius: 9px;
  padding: 0.7rem 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.streak:hover { border-color: var(--muted); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(15,23,42,0.06); }
.streak-top { display: flex; align-items: baseline; gap: 0.4rem; }
.streak-mid { }
.flame {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 5px;
}
.flame-up { color: var(--up); background: rgba(230,57,80,0.1); }
.flame-dn { color: var(--dn); background: rgba(16,183,122,0.1); }
.streak-bot { display: flex; align-items: baseline; justify-content: space-between; }
.streak-net { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; font-weight: 600; }
.streak-close { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--muted); }
</style>
