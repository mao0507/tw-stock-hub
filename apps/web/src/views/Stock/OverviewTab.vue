<script setup lang="ts">
// 總覽分頁：走勢 + 估值/體質評分 + 籌碼速覽 + 近期新聞（參考玩股網總覽 / 財報狗健診）
import { ref, computed, watch, onMounted } from 'vue'
import { IndexLineChart } from '@tw-stock-hub/charts'
import { NewsFeed } from '@tw-stock-hub/ui'
import { stockApi } from '@tw-stock-hub/api-client'
import type { DailyQuote, Institutional, Margin, Valuation, StockScore } from '@tw-stock-hub/types'

type Period = '1M' | '3M' | '6M' | '1Y'
type TabKey = 'technical' | 'fundamental' | 'institutional' | 'margin' | 'broker' | 'dividend' | 'backtest' | 'news' | 'mops'

const props = defineProps<{
  stockId: string
  quoteData: DailyQuote[]
  institutionalData: Institutional[]
  marginData: Margin[]
}>()

const emit = defineEmits<{ go: [tab: TabKey] }>()

// ── 走勢圖（沿用 IndexLineChart，日線收盤映射）
const period = ref<Period>('3M')
const PERIOD_DAYS: Record<Period, number> = { '1M': 22, '3M': 66, '6M': 132, '1Y': 250 }

const lineData = computed(() => {
  const rows = props.quoteData.slice(-PERIOD_DAYS[period.value])
  return rows.map((q, i) => {
    const prev = i > 0 ? rows[i - 1]!.close : q.close
    return {
      date: q.date.slice(0, 10),
      close: q.close,
      change: q.close - prev,
      changePct: q.changePct ?? (prev ? ((q.close - prev) / prev) * 100 : 0),
      totalValue: 0,
    }
  })
})

// ── 估值 + 體質評分（自載，ETF 或缺資料時各自為 null）
const valuation = ref<Valuation | null>(null)
const score = ref<StockScore | null>(null)

async function loadValuation(): Promise<void> {
  valuation.value = null
  score.value = null
  const [v, s] = await Promise.all([
    stockApi.getValuation(props.stockId).catch(() => null),
    stockApi.getScore(props.stockId).catch(() => null),
  ])
  valuation.value = v
  score.value = s
}

onMounted(() => { void loadValuation() })
watch(() => props.stockId, () => { void loadValuation() })

// ── 籌碼速覽：法人近 5 日合計 + 融資近 5 日
const inst5 = computed(() => {
  const rows = [...props.institutionalData]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
  if (!rows.length) return null
  const sum = (pick: (r: Institutional) => number): number =>
    rows.reduce((s, r) => s + pick(r), 0)
  return {
    days: rows.length,
    items: [
      { label: '外資', net: sum(r => r.foreignNet) },
      { label: '投信', net: sum(r => r.trustNet) },
      { label: '自營', net: sum(r => r.dealerNet) },
      { label: '合計', net: sum(r => r.totalNet) },
    ],
  }
})

const instMax = computed(() =>
  Math.max(1, ...(inst5.value?.items.map(i => Math.abs(i.net)) ?? []))
)

const margin5 = computed(() => {
  const rows = [...props.marginData]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
  if (!rows.length) return null
  return {
    days: rows.length,
    marginChange: rows.reduce((s, r) => s + r.marginChange, 0),
    ratio: rows[0]!.ratio,
    balance: rows[0]!.marginBalance,
  }
})

function fmtNet(v: number): string {
  const lots = Math.round(v / 1000)
  const abs = Math.abs(lots)
  const sign = lots >= 0 ? '+' : '-'
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}萬張`
  return `${lots >= 0 ? '+' : ''}${lots.toLocaleString()}張`
}
</script>

<template>
  <div class="space-y-4">
    <!-- 走勢 + 估值/評分 -->
    <div class="grid gap-4 lg:grid-cols-3">
      <div class="panel lg:col-span-2">
        <div class="panel-hd">
          <span class="panel-title">收盤走勢</span>
          <button class="ov-more" @click="emit('go', 'technical')">技術分析 →</button>
        </div>
        <div class="p-3">
          <div v-if="!lineData.length" class="ov-empty">無行情資料</div>
          <IndexLineChart
            v-else
            :data="lineData"
            :period="period"
            :height="248"
            @period-change="period = $event"
          />
        </div>
      </div>

      <!-- 右欄：估值 + 籌碼速覽 -->
      <div class="flex flex-col gap-4">
        <div class="panel">
          <div class="panel-hd">
            <span class="panel-title">估值與體質</span>
            <button class="ov-more" @click="emit('go', 'fundamental')">基本面 →</button>
          </div>
          <div class="space-y-3 p-4">
            <div v-if="score" class="flex items-center gap-3">
              <div class="ov-grade" :class="`grade-${score.grade}`">{{ score.grade }}</div>
              <div>
                <div class="num text-xl font-bold text-gray-900">
                  {{ score.composite }}<span class="text-xs font-normal text-gray-400"> / 100</span>
                </div>
                <div class="text-xs text-gray-400">財務體質評分</div>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
              <div class="stat-cell">
                <span class="stat-k">本益比</span>
                <span class="stat-v">{{ valuation?.pe ?? '—' }}</span>
              </div>
              <div class="stat-cell">
                <span class="stat-k">股價淨值比</span>
                <span class="stat-v">{{ valuation?.pb ?? '—' }}</span>
              </div>
              <div class="stat-cell">
                <span class="stat-k">殖利率</span>
                <span class="stat-v">{{ valuation?.dividendYield != null ? `${valuation.dividendYield}%` : '—' }}</span>
              </div>
            </div>
            <div v-if="!score && !valuation" class="ov-empty">無估值資料</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-hd">
            <span class="panel-title">籌碼速覽<span class="ml-1.5 text-xs font-normal text-gray-400">近 {{ inst5?.days ?? 0 }} 日</span></span>
            <button class="ov-more" @click="emit('go', 'institutional')">法人動向 →</button>
          </div>
          <div class="space-y-2.5 p-4">
            <div v-if="!inst5" class="ov-empty">無法人資料</div>
            <template v-else>
              <div v-for="it in inst5.items" :key="it.label" class="flex items-center gap-2">
                <span class="w-9 shrink-0 text-xs text-gray-500">{{ it.label }}</span>
                <div class="flex h-4 flex-1 items-center">
                  <div class="flex w-1/2 justify-end">
                    <div
                      v-if="it.net < 0"
                      class="flow-bar flow-dn"
                      :style="{ width: `${(Math.abs(it.net) / instMax) * 100}%` }"
                    />
                  </div>
                  <div class="h-4 w-px shrink-0 bg-gray-200" />
                  <div class="w-1/2">
                    <div
                      v-if="it.net > 0"
                      class="flow-bar flow-up"
                      :style="{ width: `${(it.net / instMax) * 100}%` }"
                    />
                  </div>
                </div>
                <span
                  class="num w-20 shrink-0 text-right text-xs"
                  :class="it.net >= 0 ? 'is-up' : 'is-dn'"
                >{{ fmtNet(it.net) }}</span>
              </div>
            </template>

            <div v-if="margin5" class="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-100 pt-2.5 text-xs">
              <span class="text-gray-500">融資{{ margin5.days }}日
                <b class="num" :class="margin5.marginChange >= 0 ? 'is-up' : 'is-dn'">
                  {{ margin5.marginChange >= 0 ? '+' : '' }}{{ margin5.marginChange.toLocaleString() }}張
                </b>
              </span>
              <span class="text-gray-500">融資餘額 <b class="num text-gray-700">{{ margin5.balance.toLocaleString() }}張</b></span>
              <span class="text-gray-500">券資比 <b class="num text-gray-700">{{ margin5.ratio != null ? `${margin5.ratio.toFixed(1)}%` : '—' }}</b></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd">
        <span class="panel-title">近期新聞</span>
        <button class="ov-more" @click="emit('go', 'news')">更多 →</button>
      </div>
      <div class="max-h-[360px] overflow-y-auto">
        <NewsFeed :stock-id="stockId" :page-size="5" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov-more {
  font-size: 0.72rem;
  color: var(--muted);
  transition: color 0.15s;
}
.ov-more:hover { color: var(--txt); }
.ov-empty { padding: 1.5rem 0; text-align: center; font-size: 0.8rem; color: var(--muted); }

.ov-grade {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 10px;
  font-size: 1.3rem;
  font-weight: 800;
  flex-shrink: 0;
}
.grade-A { color: var(--up); background: var(--up-soft); }
.grade-B { color: #2f5d8a; background: rgba(47, 93, 138, 0.1); }
.grade-C { color: #9a6416; background: rgba(183, 121, 31, 0.12); }
.grade-D, .grade-F { color: var(--dn); background: var(--dn-soft); }
</style>
