<script setup lang="ts">
// 基本面分頁：財報狗式六分類（關鍵指標/獲利能力/成長力/價值評估/安全性/董監與籌碼）
import { ref, computed, watch, onMounted } from 'vue'
import { PieChart, PIE_PALETTE } from '@tw-stock-hub/charts'
import { LoadingSkeleton } from '@tw-stock-hub/ui'
import { stockApi } from '@tw-stock-hub/api-client'
import type {
  RevenueItem, FinancialItem, DividendItem, Valuation, HolderItem,
  EtfHoldings, StockScore, Institutional, Margin, FinancialMetrics,
} from '@tw-stock-hub/types'
import TrendChart from './TrendChart.vue'
import type { TrendSeries } from './TrendChart.vue'
import RevenueChart from './RevenueChart.vue'

type FundView = 'key' | 'profit' | 'growth' | 'value' | 'safety' | 'holders'

const props = defineProps<{
  stockId: string
  institutionalData: Institutional[]
  marginData: Margin[]
}>()

const emit = defineEmits<{ go: [tab: string] }>()

const view = ref<FundView>('key')
const views: { key: FundView; label: string }[] = [
  { key: 'key', label: '關鍵指標' },
  { key: 'profit', label: '獲利能力' },
  { key: 'growth', label: '成長力' },
  { key: 'value', label: '價值評估' },
  { key: 'safety', label: '安全性' },
  { key: 'holders', label: '董監與籌碼' },
]

// ── 資料載入
const revenue = ref<RevenueItem[]>([])
const financials = ref<FinancialItem[]>([])
const dividends = ref<DividendItem[]>([])
const valuation = ref<Valuation | null>(null)
const holders = ref<HolderItem[]>([])
const etf = ref<EtfHoldings | null>(null)
const score = ref<StockScore | null>(null)
const metrics = ref<FinancialMetrics | null>(null)
const loading = ref(false)
let loadedFor = ''

const isEtf = computed(() => /^00/.test(props.stockId))

async function load(): Promise<void> {
  if (loadedFor === props.stockId) return
  loading.value = true
  try {
    if (isEtf.value) {
      const [e, v] = await Promise.all([
        stockApi.getEtfHoldings(props.stockId),
        stockApi.getValuation(props.stockId),
      ])
      etf.value = e
      valuation.value = v
    } else {
      etf.value = null
      const [r, f, d, v, h, s, m] = await Promise.all([
        stockApi.getRevenue(props.stockId),
        stockApi.getFinancials(props.stockId),
        stockApi.getDividends(props.stockId),
        stockApi.getValuation(props.stockId),
        stockApi.getHolders(props.stockId),
        stockApi.getScore(props.stockId).catch(() => null),
        stockApi.getMetrics(props.stockId).catch(() => null),
      ])
      revenue.value = r
      financials.value = f
      dividends.value = d
      valuation.value = v
      holders.value = h
      score.value = s
      metrics.value = m
    }
    loadedFor = props.stockId
  } finally {
    loading.value = false
  }
}

onMounted(() => { void load() })
watch(() => props.stockId, () => { view.value = 'key'; void load() })

// ── 共用衍生
const latestRev = computed(() => revenue.value[revenue.value.length - 1] ?? null)
const latestFin = computed(() => financials.value[financials.value.length - 1] ?? null)
const maxEps = computed(() => Math.max(0.01, ...financials.value.map(f => Math.abs(f.eps ?? 0))))
const revBars = computed(() => revenue.value.slice(-24))
const epsBars = computed(() => financials.value.slice(-12))
const latestHolder = computed(() => holders.value[holders.value.length - 1] ?? null)

function fmtRevenue(v: number | null): string {
  if (v == null) return '—'
  return `${(v / 1e5).toFixed(1)} 億` // 千元 → 億
}
function fmtYM(ym: string): string {
  return `${ym.slice(0, 3)}/${ym.slice(3)}`
}
function pctStr(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

// ── 獲利能力：三率趨勢 + 獲利結構
const marginTrend = computed<TrendSeries[]>(() => {
  const rows = financials.value.slice(-16)
  if (!rows.length) return []
  const pick = (get: (f: FinancialItem) => number | null): { date: string; value: number | null }[] =>
    rows.map(f => ({ date: f.period, value: get(f) }))
  return [
    { name: '毛利率', color: '#2f5d8a', data: pick(f => f.grossMargin) },
    { name: '營益率', color: '#b7791f', data: pick(f => f.opMargin) },
    { name: '淨利率', color: '#1f4d3a', data: pick(f => f.netMargin) },
  ]
})

const marginBars = computed(() => {
  const f = latestFin.value
  if (!f) return []
  return [
    { label: '毛利率', value: f.grossMargin },
    { label: '營益率', value: f.opMargin },
    { label: '淨利率', value: f.netMargin },
  ]
})

// 三率指標說明（公式 + 解讀）
const marginDocs = computed(() => {
  const f = latestFin.value
  return [
    {
      name: '毛利率',
      latest: f?.grossMargin ?? null,
      formula: '毛利率 = 單季毛利 / 單季營收（年報：全年毛利 / 全年營收）',
      desc: '毛利率用來觀察公司產品或服務本身成本變化。當產品或服務成本（銷貨成本）增加，毛利率會下滑；當成本減少，毛利率會上升。每個產業公司的營運和成本不盡相同，因此毛利率走勢觀察比數據大小重要；毛利率的比較，應以同產業作為基礎才有意義。',
    },
    {
      name: '營業利益率',
      latest: f?.opMargin ?? null,
      formula: '營業利益率 = 單季營業利益 / 單季營收（年報：全年營業利益 / 全年營收）',
      desc: '營業利益率除了觀察產品成本的變化，也包含營業費用（薪資、廣告費）的觀察。當產品成本和營業費用增加，營業利益率會下滑；當兩者減少，營業利益率會上升。走勢觀察比數據大小重要；比較應以同產業作為基礎才有意義。',
    },
    {
      name: '淨利率',
      latest: f?.netMargin ?? null,
      formula: '淨利率 = 單季稅後淨利 / 單季營收（年報：全年稅後淨利 / 全年營收）',
      desc: '淨利率是觀察扣除成本、費用、還有業外損益後，淨利占營收的比例。走勢觀察比數據大小重要；比較應以同產業作為基礎才有意義。淨利包含業外損益，可能大於營收使淨利率大於 100%，此時應特別注意業外損益來源，或以合併報表作為觀察。',
    },
  ]
})

// ── 進階指標（metrics API）
const mQuarters = computed(() => metrics.value?.quarters ?? [])

function mkSeries(
  picks: { name: string; color: string; get: (q: FinancialMetrics['quarters'][number]) => number | null }[],
): TrendSeries[] {
  const rows = mQuarters.value.slice(-16)
  if (!rows.length) return []
  const series = picks.map(p => ({
    name: p.name,
    color: p.color,
    data: rows.map(q => ({ date: q.period, value: p.get(q) })),
  }))
  // 全空序列（如無合約負債科目）→ 整組視為無資料
  return series.some(s => s.data.some(d => d.value != null)) ? series : []
}

const opexNonOpTrend = computed(() => mkSeries([
  { name: '營業費用率', color: '#6b4f8a', get: q => q.opExpenseRatio },
  { name: '業外佔稅前淨利', color: '#b7791f', get: q => q.nonOpToPretaxPct },
]))

const roeRoaTrend = computed(() => mkSeries([
  { name: 'ROE（年化）', color: '#1f4d3a', get: q => q.roe },
  { name: 'ROA（年化）', color: '#2f5d8a', get: q => q.roa },
]))

const turnoverTrend = computed(() => mkSeries([
  { name: '存貨週轉天數', color: '#6b4f8a', get: q => q.inventoryDays },
  { name: '應收帳款收現天數', color: '#1c7c54', get: q => q.receivableDays },
]))

const contractTrend = computed(() => mkSeries([
  { name: '合約負債佔營收', color: '#2f5d8a', get: q => q.contractLiabToRevenuePct },
]))

// 杜邦分析：近 8 季（新→舊）
const dupontRows = computed(() => [...mQuarters.value.slice(-8)].reverse())

const payouts = computed(() => metrics.value?.payouts ?? [])

// ── 成長力：近 12 月成長明細（新→舊）
const growthRows = computed(() => [...revenue.value.slice(-12)].reverse())

// ── 價值評估：PE 歷史
const peTrend = computed<TrendSeries[]>(() => {
  const hist = valuation.value?.history ?? []
  if (!hist.length) return []
  return [{
    name: '本益比',
    color: '#6b4f8a',
    data: hist.map(h => ({ date: h.date.slice(0, 10), value: h.pe })),
  }]
})

// ── 安全性（以現有資料代理：配息穩定 + EPS 穩定）
const consecDividendYears = computed(() => {
  const byYear = new Map<number, number>()
  for (const d of dividends.value) {
    const y = Number(d.year)
    if (!Number.isFinite(y)) continue
    byYear.set(y, (byYear.get(y) ?? 0) + d.cash + d.stock)
  }
  const years = [...byYear.entries()]
    .filter(([, sum]) => sum > 0)
    .map(([y]) => y)
    .sort((a, b) => b - a)
  if (!years.length) return 0
  let n = 1
  for (let i = 1; i < years.length; i++) {
    if (years[i] === years[i - 1]! - 1) n++
    else break
  }
  return n
})

const fillStats = computed(() => {
  const judged = dividends.value.filter(d => d.filled != null)
  const filled = judged.filter(d => d.filled === true)
  const days = filled.map(d => d.fillDays).filter((v): v is number => v != null)
  return {
    total: judged.length,
    rate: judged.length ? Math.round((filled.length / judged.length) * 100) : null,
    avgDays: days.length ? Math.round(days.reduce((s, v) => s + v, 0) / days.length) : null,
  }
})

const lossQuarters = computed(() => {
  const rows = financials.value.slice(-12)
  return {
    total: rows.filter(f => f.eps != null).length,
    loss: rows.filter(f => f.eps != null && f.eps < 0).length,
  }
})

// ── 董監與籌碼：大戶持股趨勢 + 法人/融資摘要
const holderTrend = computed<TrendSeries[]>(() => {
  if (!holders.value.length) return []
  return [{
    name: '大戶持股',
    color: '#1f4d3a',
    data: holders.value.map(h => ({ date: h.date.slice(0, 10), value: h.bigHolderPct })),
  }]
})

const inst20 = computed(() => {
  const rows = [...props.institutionalData]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
  if (!rows.length) return null
  const sum = (pick: (r: Institutional) => number): number =>
    Math.round(rows.reduce((s, r) => s + pick(r), 0) / 1000)
  return {
    days: rows.length,
    foreign: sum(r => r.foreignNet),
    trust: sum(r => r.trustNet),
    dealer: sum(r => r.dealerNet),
    total: sum(r => r.totalNet),
  }
})

const marginNow = computed(() => {
  const rows = [...props.marginData].sort((a, b) => b.date.localeCompare(a.date))
  const latest = rows[0]
  if (!latest) return null
  const chg20 = rows.slice(0, 20).reduce((s, r) => s + r.marginChange, 0)
  return { balance: latest.marginBalance, ratio: latest.ratio, chg20 }
})

function lotsStr(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toLocaleString()}張`
}

// ── ETF 行業比重
const industries = computed(() => etf.value?.industries ?? [])
const industryPie = computed(() => {
  const list = industries.value
  if (list.length <= 9) return list.map(i => ({ name: i.sector, value: i.weight }))
  const top = list.slice(0, 8)
  const rest = list.slice(8).reduce((s, i) => s + i.weight, 0)
  return [...top.map(i => ({ name: i.sector, value: i.weight })), { name: '其餘', value: Math.round(rest * 100) / 100 }]
})
function pieColor(i: number): string {
  return PIE_PALETTE[i % PIE_PALETTE.length]!
}
</script>

<template>
  <LoadingSkeleton
    v-if="loading"
    type="table"
    :rows="8"
  />

  <!-- ETF：基本資料 + 行業比重 + 成分股 -->
  <div
    v-else-if="isEtf"
    class="space-y-5"
  >
    <div
      v-if="etf?.info?.length"
      class="fund-sec"
    >
      <div class="fund-hd">基本資料</div>
      <div class="info-grid">
        <div
          v-for="[k, v] in etf.info"
          :key="k"
          class="info-cell"
        >
          <span class="info-k">{{ k }}</span>
          <a
            v-if="/^https?:/.test(v)"
            :href="v"
            target="_blank"
            rel="noopener"
            class="info-v info-link"
          >{{ v }}</a>
          <span
            v-else
            class="info-v"
          >{{ v }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="valuation?.dividendYield != null"
      class="kpi-grid"
    >
      <div class="kpi">
        <span class="kpi-k">現金殖利率</span>
        <span class="kpi-v">{{ valuation.dividendYield }}</span>
        <span class="kpi-x">%</span>
      </div>
    </div>

    <div
      v-if="industries.length"
      class="fund-sec"
    >
      <div class="fund-hd">行業比重</div>
      <div class="ind-row">
        <div>
          <PieChart
            :data="industryPie"
            :height="240"
          />
        </div>
        <div class="ind-list">
          <div
            v-for="(ind, i) in industries"
            :key="ind.sector"
            class="ind-item"
          >
            <span
              class="ind-dot"
              :style="{ background: pieColor(i) }"
            />
            <span class="ind-name">{{ ind.sector }}</span>
            <span class="ind-w num">{{ ind.weight.toFixed(2) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="fund-sec">
      <div class="fund-hd-row">
        <span class="fund-hd">成分股與權重</span>
        <span class="fund-hd-side">{{ etf?.holdings.length ?? 0 }} 檔<span v-if="etf?.updatedDate"> · {{ etf.updatedDate.slice(0, 10) }}</span></span>
      </div>
      <div
        v-if="!etf?.holdings.length"
        class="fund-empty"
      >
        無成分資料
      </div>
      <table
        v-else
        class="fund-table etf-table"
      >
        <thead><tr><th>#</th><th>成分股</th><th>權重</th><th>權重占比</th></tr></thead>
        <tbody>
          <tr
            v-for="(h, i) in etf.holdings"
            :key="h.stockId"
          >
            <td class="num">{{ i + 1 }}</td>
            <td style="text-align:left">
              <router-link
                :to="`/stocks/${h.stockId}`"
                class="etf-link"
              >{{ h.stockName }}</router-link>
              <span
                class="num"
                style="color:var(--muted);font-size:0.66rem;margin-left:0.35rem"
              >{{ h.stockId }}</span>
            </td>
            <td
              class="num"
              style="font-weight:600"
            >{{ h.weight?.toFixed(2) }}%</td>
            <td>
              <div class="etf-bar-track">
                <div
                  class="etf-bar-fill"
                  :style="{ width: `${Math.min(100, (h.weight ?? 0) / (etf.holdings[0]?.weight ?? 1) * 100)}%` }"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 個股：六分類 -->
  <div
    v-else
    class="space-y-4"
  >
    <div class="flex gap-1 overflow-x-auto border-b border-gray-100">
      <button
        v-for="v in views"
        :key="v.key"
        class="seg shrink-0 whitespace-nowrap"
        :class="view === v.key && 'seg-on'"
        @click="view = v.key"
      >
        {{ v.label }}
      </button>
    </div>

    <!-- 關鍵指標 -->
    <template v-if="view === 'key'">
      <div
        v-if="score"
        class="fund-sec"
      >
        <div class="fund-hd">財務體質評分</div>
        <div class="score-row">
          <div
            class="score-badge"
            :class="`grade-${score.grade}`"
          >
            {{ score.grade }}
          </div>
          <div class="score-composite">
            {{ score.composite }}<span class="score-x">/ 100</span>
          </div>
          <div class="score-bars">
            <div
              v-for="b in score.breakdown"
              :key="b.label"
              class="score-bar-item"
            >
              <span class="score-bar-label">{{ b.label }}</span>
              <div class="score-bar-track">
                <div
                  class="score-bar-fill"
                  :style="{ width: `${b.score}%` }"
                />
              </div>
              <span class="score-bar-value num">{{ Math.round(b.score) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi">
          <span class="kpi-k">本益比 PE</span>
          <span class="kpi-v">{{ valuation?.pe ?? '—' }}</span>
          <span class="kpi-x">
            <template v-if="valuation?.pe != null">倍</template>
            <template v-else-if="valuation && valuation.ttmEps != null && valuation.ttmEps <= 0">近四季EPS {{ valuation.ttmEps }} 虧損</template>
            <template v-else>無 EPS 資料</template>
          </span>
        </div>
        <div class="kpi">
          <span class="kpi-k">股價淨值比 PB</span>
          <span class="kpi-v">{{ valuation?.pb ?? '—' }}</span>
          <span class="kpi-x">倍</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">現金殖利率</span>
          <span class="kpi-v">{{ valuation?.dividendYield ?? '—' }}</span>
          <span class="kpi-x">%</span>
        </div>
        <div
          v-if="latestFin"
          class="kpi"
        >
          <span class="kpi-k">EPS（{{ latestFin.period }}）</span>
          <span
            class="kpi-v"
            :class="(latestFin.eps ?? 0) >= 0 ? 'is-up' : 'is-dn'"
          >{{ latestFin.eps ?? '—' }}</span>
          <span class="kpi-x">元</span>
        </div>
        <div
          v-if="latestRev"
          class="kpi"
        >
          <span class="kpi-k">月營收年增（{{ fmtYM(latestRev.yearMonth) }}）</span>
          <span
            class="kpi-v"
            :class="(latestRev.yoyPct ?? 0) >= 0 ? 'is-up' : 'is-dn'"
          >{{ pctStr(latestRev.yoyPct) }}</span>
        </div>
        <div
          v-if="latestFin?.grossMargin != null"
          class="kpi"
        >
          <span class="kpi-k">毛利率（{{ latestFin.period }}）</span>
          <span class="kpi-v">{{ latestFin.grossMargin }}</span>
          <span class="kpi-x">%</span>
        </div>
        <div
          v-if="latestHolder"
          class="kpi"
        >
          <span class="kpi-k">大戶持股</span>
          <span class="kpi-v">{{ latestHolder.bigHolderPct ?? '—' }}</span>
          <span class="kpi-x">%（&gt;1000 張）</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">連續配息</span>
          <span class="kpi-v">{{ consecDividendYears }}</span>
          <span class="kpi-x">年</span>
        </div>
      </div>
      <p class="fund-note">※ 各分類明細見上方切換。評分權重見「財務體質評分」各構面。</p>
    </template>

    <!-- 獲利能力 -->
    <template v-else-if="view === 'profit'">
      <div class="fund-sec">
        <div class="fund-hd">三率趨勢（近 {{ marginTrend[0]?.data.length ?? 0 }} 季）</div>
        <div
          v-if="!marginTrend.length"
          class="fund-empty"
        >
          無財報資料
        </div>
        <TrendChart
          v-else
          :series="marginTrend"
          :height="240"
          unit="%"
        />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="fund-sec">
          <div class="fund-hd">ROE / ROA（單季年化）</div>
          <div
            v-if="!roeRoaTrend.length"
            class="fund-empty"
          >
            無資產負債表資料
          </div>
          <TrendChart
            v-else
            :series="roeRoaTrend"
            :height="220"
            unit="%"
          />
        </div>
        <div class="fund-sec">
          <div class="fund-hd">營業費用率 / 業外佔稅前淨利</div>
          <div
            v-if="!opexNonOpTrend.length"
            class="fund-empty"
          >
            無費用/業外資料
          </div>
          <TrendChart
            v-else
            :series="opexNonOpTrend"
            :height="220"
            unit="%"
          />
        </div>
      </div>

      <div class="fund-sec">
        <div class="fund-hd">杜邦分析（近 {{ dupontRows.length }} 季）</div>
        <div
          v-if="!dupontRows.length"
          class="fund-empty"
        >
          無資產負債表資料
        </div>
        <table
          v-else
          class="fund-table"
        >
          <thead>
            <tr><th>季度</th><th>ROE</th><th>淨利率</th><th>總資產週轉（次/年）</th><th>權益乘數</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="q in dupontRows"
              :key="q.period"
            >
              <td class="num">{{ q.period }}</td>
              <td
                class="num"
                :class="(q.roe ?? 0) >= 0 ? 'is-up' : 'is-dn'"
                style="font-weight:600"
              >{{ q.roe != null ? `${q.roe}%` : '—' }}</td>
              <td class="num">{{ q.netMargin != null ? `${q.netMargin}%` : '—' }}</td>
              <td class="num">{{ q.assetTurnover ?? '—' }}</td>
              <td class="num">{{ q.equityMultiplier ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="fund-note mt-2">※ ROE = 淨利率 × 總資產週轉 × 權益乘數。單季損益年化（×4）除以期初期末平均存量。</p>
      </div>

      <div class="fund-sec">
        <div class="fund-hd">指標說明</div>
        <details
          v-for="d in marginDocs"
          :key="d.name"
          class="doc-item"
        >
          <summary class="doc-summary">
            <span class="doc-name">{{ d.name }}</span>
            <span
              class="num doc-latest"
              :class="(d.latest ?? 0) >= 0 ? 'is-up' : 'is-dn'"
            >{{ d.latest != null ? `${d.latest}%` : '—' }}</span>
          </summary>
          <div class="doc-body">
            <p class="doc-formula num">{{ d.formula }}</p>
            <p class="doc-desc">{{ d.desc }}</p>
          </div>
        </details>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="fund-sec">
          <div class="fund-hd">季 EPS（近 {{ epsBars.length }} 季）</div>
          <div
            v-if="!epsBars.length"
            class="fund-empty"
          >
            無財報資料
          </div>
          <div
            v-else
            class="bar-chart"
          >
            <div
              v-for="f in epsBars"
              :key="f.period"
              class="bc-col"
              :title="`${f.period}: EPS ${f.eps}`"
            >
              <div class="bc-wrap">
                <div
                  class="bc-bar"
                  :class="(f.eps ?? 0) >= 0 ? 'bc-up' : 'bc-dn'"
                  :style="{ height: `${(Math.abs(f.eps ?? 0) / maxEps) * 100}%` }"
                />
              </div>
              <span class="bc-x num">{{ f.period.slice(2) }}</span>
            </div>
          </div>
        </div>
        <div
          v-if="latestFin"
          class="fund-sec"
        >
          <div class="fund-hd">獲利結構（{{ latestFin.period }}）</div>
          <div class="margin-bars">
            <div
              v-for="m in marginBars"
              :key="m.label"
              class="mbar"
            >
              <div class="mbar-top">
                <span>{{ m.label }}</span><span
                  class="num"
                  :class="(m.value ?? 0) >= 0 ? 'is-up' : 'is-dn'"
                >{{ m.value != null ? `${m.value}%` : '—' }}</span>
              </div>
              <div class="mbar-track">
                <div
                  class="mbar-fill"
                  :style="{ width: `${Math.max(0, Math.min(100, m.value ?? 0))}%` }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 成長力 -->
    <template v-else-if="view === 'growth'">
      <div class="fund-sec">
        <div class="fund-hd-row">
          <span class="fund-hd">月營收趨勢（近 {{ revBars.length }} 月，億）</span>
          <span
            v-if="latestRev"
            class="fund-hd-side"
          >
            最新 <b class="is-up">{{ fmtRevenue(latestRev.revenue) }}</b>
            · 年增 <b :class="(latestRev.yoyPct ?? 0) >= 0 ? 'is-up' : 'is-dn'">{{ pctStr(latestRev.yoyPct) }}</b>
          </span>
        </div>
        <div
          v-if="!revBars.length"
          class="fund-empty"
        >
          無營收資料
        </div>
        <RevenueChart
          v-else
          :data="revBars"
          :height="260"
        />
      </div>

      <div class="fund-sec">
        <div class="fund-hd">營收成長明細（近 12 月）</div>
        <div
          v-if="!growthRows.length"
          class="fund-empty"
        >
          無營收資料
        </div>
        <table
          v-else
          class="fund-table"
        >
          <thead>
            <tr><th>月份</th><th>營收</th><th>月增 MoM</th><th>年增 YoY</th><th>累計年增</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="r in growthRows"
              :key="r.yearMonth"
            >
              <td class="num">{{ fmtYM(r.yearMonth) }}</td>
              <td class="num">{{ fmtRevenue(r.revenue) }}</td>
              <td
                class="num"
                :class="(r.momPct ?? 0) >= 0 ? 'is-up' : 'is-dn'"
              >{{ pctStr(r.momPct) }}</td>
              <td
                class="num"
                :class="(r.yoyPct ?? 0) >= 0 ? 'is-up' : 'is-dn'"
              >{{ pctStr(r.yoyPct) }}</td>
              <td
                class="num"
                :class="(r.cumYoyPct ?? 0) >= 0 ? 'is-up' : 'is-dn'"
              >{{ pctStr(r.cumYoyPct) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- 價值評估 -->
    <template v-else-if="view === 'value'">
      <div class="kpi-grid">
        <div class="kpi">
          <span class="kpi-k">本益比 PE</span>
          <span class="kpi-v">{{ valuation?.pe ?? '—' }}</span>
          <span class="kpi-x">倍</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">股價淨值比 PB</span>
          <span class="kpi-v">{{ valuation?.pb ?? '—' }}</span>
          <span class="kpi-x">倍</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">現金殖利率</span>
          <span class="kpi-v">{{ valuation?.dividendYield ?? '—' }}</span>
          <span class="kpi-x">%</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">近四季 EPS</span>
          <span
            class="kpi-v"
            :class="(valuation?.ttmEps ?? 0) >= 0 ? 'is-up' : 'is-dn'"
          >{{ valuation?.ttmEps ?? '—' }}</span>
          <span class="kpi-x">元</span>
        </div>
      </div>

      <div class="fund-sec">
        <div class="fund-hd">本益比走勢</div>
        <div
          v-if="!peTrend.length"
          class="fund-empty"
        >
          無本益比歷史資料
        </div>
        <TrendChart
          v-else
          :series="peTrend"
          :height="240"
          unit="倍"
        />
      </div>
      <p class="fund-note">※ 本益比以每日收盤價除以近四季 EPS 計算。</p>
    </template>

    <!-- 安全性 -->
    <template v-else-if="view === 'safety'">
      <div class="kpi-grid">
        <div class="kpi">
          <span class="kpi-k">連續配息</span>
          <span class="kpi-v">{{ consecDividendYears }}</span>
          <span class="kpi-x">年</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">填息率</span>
          <span
            class="kpi-v"
            :class="fillStats.rate != null && fillStats.rate >= 50 ? 'is-up' : 'is-dn'"
          >{{ fillStats.rate ?? '—' }}</span>
          <span class="kpi-x">%（{{ fillStats.total }} 次配息）</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">平均填息天數</span>
          <span class="kpi-v">{{ fillStats.avgDays ?? '—' }}</span>
          <span class="kpi-x">交易日</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">近 {{ lossQuarters.total }} 季虧損</span>
          <span
            class="kpi-v"
            :class="lossQuarters.loss === 0 ? 'is-up' : 'is-dn'"
          >{{ lossQuarters.loss }}</span>
          <span class="kpi-x">季（EPS &lt; 0）</span>
        </div>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="fund-sec">
          <div class="fund-hd">營運週轉天數</div>
          <div
            v-if="!turnoverTrend.length"
            class="fund-empty"
          >
            無存貨/應收帳款資料
          </div>
          <TrendChart
            v-else
            :series="turnoverTrend"
            :height="220"
            unit="天"
          />
        </div>
        <div class="fund-sec">
          <div class="fund-hd">合約負債佔營收（近四季營收年化）</div>
          <div
            v-if="!contractTrend.length"
            class="fund-empty"
          >
            此公司財報無合約負債科目
          </div>
          <TrendChart
            v-else
            :series="contractTrend"
            :height="220"
            unit="%"
          />
        </div>
      </div>

      <div class="fund-sec">
        <div class="fund-hd">現金股利發放率（近 {{ payouts.length }} 年）</div>
        <div
          v-if="!payouts.length"
          class="fund-empty"
        >
          無現金股利紀錄
        </div>
        <table
          v-else
          class="fund-table"
        >
          <thead>
            <tr><th>股利所屬年度</th><th>現金股利（元）</th><th>全年 EPS（元）</th><th>發放率</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="p in payouts"
              :key="p.year"
            >
              <td class="num">{{ p.year }}</td>
              <td class="num is-up">{{ p.cashDividend.toFixed(2) }}</td>
              <td class="num">{{ p.eps ?? '—' }}</td>
              <td
                class="num"
                style="font-weight:600"
              >{{ p.payoutPct != null ? `${p.payoutPct}%` : '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="fund-note mt-2">※ 發放率 = 現金股利 / 該年度四季 EPS 合計；年度 EPS 不足四季時不計算。</p>
      </div>

      <p class="fund-note">※ 負債比/流動比等資產負債結構指標待補；營運週轉與配息穩定度見上。</p>
    </template>

    <!-- 董監與籌碼 -->
    <template v-else>
      <div class="fund-sec">
        <div class="fund-hd">大戶持股趨勢（持股 &gt;1000 張）</div>
        <div
          v-if="!holderTrend.length"
          class="fund-empty"
        >
          無大戶資料
        </div>
        <template v-else>
          <TrendChart
            :series="holderTrend"
            :height="220"
            unit="%"
          />
          <p
            v-if="latestHolder"
            class="fund-note mt-2"
          >
            最新：大戶持股 <b class="is-up">{{ latestHolder.bigHolderPct }}%</b>
            · {{ latestHolder.bigHolderCount?.toLocaleString() }} 位大戶
            · 總股東 {{ latestHolder.totalHolders?.toLocaleString() }} 人
          </p>
        </template>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="fund-sec">
          <div class="fund-hd-row">
            <span class="fund-hd">法人買賣超（近 {{ inst20?.days ?? 0 }} 日合計）</span>
            <button
              class="fund-more"
              @click="emit('go', 'institutional')"
            >
              籌碼分析 →
            </button>
          </div>
          <div
            v-if="!inst20"
            class="fund-empty"
          >
            無法人資料
          </div>
          <table
            v-else
            class="fund-table"
          >
            <tbody>
              <tr>
                <td>外資</td><td
                  class="num"
                  :class="inst20.foreign >= 0 ? 'is-up' : 'is-dn'"
                >{{ lotsStr(inst20.foreign) }}</td>
              </tr>
              <tr>
                <td>投信</td><td
                  class="num"
                  :class="inst20.trust >= 0 ? 'is-up' : 'is-dn'"
                >{{ lotsStr(inst20.trust) }}</td>
              </tr>
              <tr>
                <td>自營商</td><td
                  class="num"
                  :class="inst20.dealer >= 0 ? 'is-up' : 'is-dn'"
                >{{ lotsStr(inst20.dealer) }}</td>
              </tr>
              <tr>
                <td style="font-weight:600">
                  合計
                </td><td
                  class="num"
                  style="font-weight:600"
                  :class="inst20.total >= 0 ? 'is-up' : 'is-dn'"
                >{{ lotsStr(inst20.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="fund-sec">
          <div class="fund-hd">融資融券現況</div>
          <div
            v-if="!marginNow"
            class="fund-empty"
          >
            無融資融券資料
          </div>
          <table
            v-else
            class="fund-table"
          >
            <tbody>
              <tr>
                <td>融資餘額</td><td class="num">{{ marginNow.balance.toLocaleString() }}張</td>
              </tr>
              <tr>
                <td>近 20 日融資增減</td><td
                  class="num"
                  :class="marginNow.chg20 >= 0 ? 'is-up' : 'is-dn'"
                >{{ lotsStr(marginNow.chg20) }}</td>
              </tr>
              <tr>
                <td>券資比</td><td class="num">{{ marginNow.ratio != null ? `${marginNow.ratio.toFixed(1)}%` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="fund-note">※ 平台尚無董監持股申報資料，本區以大戶持股（集保戶股權分散）與法人/信用交易呈現籌碼面。</p>
    </template>
  </div>
</template>

<style scoped>
/* 指標說明摺疊 */
.doc-item { border-bottom: 1px solid var(--bd-soft); }
.doc-item:last-child { border-bottom: none; }
.doc-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.2rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--txt);
  cursor: pointer;
  list-style: none;
}
.doc-summary::-webkit-details-marker { display: none; }
.doc-summary::before { content: '▸'; color: var(--muted); font-size: 0.7rem; margin-right: 0.35rem; transition: transform 0.15s; }
.doc-item[open] .doc-summary::before { transform: rotate(90deg); }
.doc-name { flex: 1; }
.doc-latest { font-size: 0.82rem; }
.doc-body { padding: 0 0.2rem 0.7rem 1.1rem; }
.doc-formula { font-size: 0.74rem; color: var(--txt); background: var(--bg); border-radius: 6px; padding: 0.4rem 0.6rem; margin-bottom: 0.45rem; }
.doc-desc { font-size: 0.76rem; color: #3a3833; line-height: 1.7; }

.fund-more {
  font-size: 0.72rem;
  color: var(--muted);
  transition: color 0.15s;
}
.fund-more:hover { color: var(--txt); }

/* 獲利結構長條 */
.margin-bars { display: flex; flex-direction: column; gap: 0.65rem; }
.mbar-top { display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.25rem; color: #3a3833; }
.mbar-track { height: 0.55rem; background: var(--bg); border-radius: 999px; overflow: hidden; }
.mbar-fill { height: 100%; background: linear-gradient(90deg, var(--up-soft), var(--up)); border-radius: 999px; transition: width 0.4s ease; }

/* 體質評分 */
.score-row { display: flex; align-items: center; gap: 1.2rem; flex-wrap: wrap; }
.score-badge { display: flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border-radius: 10px; font-size: 1.3rem; font-weight: 800; flex-shrink: 0; }
.grade-A { color: var(--up); background: var(--up-soft); }
.grade-B { color: #2f5d8a; background: rgba(47, 93, 138, 0.1); }
.grade-C { color: #9a6416; background: rgba(183, 121, 31, 0.12); }
.grade-D, .grade-F { color: var(--dn); background: var(--dn-soft); }
.score-composite { font-family: var(--font-mono); font-size: 1.6rem; font-weight: 700; color: var(--txt); flex-shrink: 0; }
.score-x { font-size: 0.75rem; color: var(--muted); font-weight: 400; }
.score-bars { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 0.4rem; }
.score-bar-item { display: grid; grid-template-columns: 7.5rem 1fr 2rem; align-items: center; gap: 0.5rem; }
.score-bar-label { font-size: 0.72rem; color: var(--muted); }
.score-bar-track { height: 0.4rem; background: var(--bg); border-radius: 999px; overflow: hidden; }
.score-bar-fill { height: 100%; background: linear-gradient(90deg, var(--up-soft), var(--up)); border-radius: 999px; transition: width 0.4s ease; }
.score-bar-value { font-size: 0.74rem; font-weight: 600; color: var(--txt); text-align: right; }

/* ETF */
.etf-table td { padding: 0.45rem 0.5rem; }
.etf-table th:nth-child(1), .etf-table td:nth-child(1) { width: 2.5rem; text-align: center; color: var(--muted); }
.etf-table th:nth-child(2), .etf-table td:nth-child(2) { text-align: left; }
.etf-table th:nth-child(3), .etf-table td:nth-child(3) { text-align: right; width: 5rem; }
.etf-table th:nth-child(4), .etf-table td:nth-child(4) { text-align: left; width: 40%; }
.etf-link { color: var(--txt); font-weight: 600; text-decoration: none; }
.etf-link:hover { color: var(--up); }
.etf-bar-track { height: 0.5rem; background: var(--bg); border-radius: 999px; overflow: hidden; min-width: 80px; }
.etf-bar-fill { height: 100%; background: linear-gradient(90deg, var(--up-soft), var(--up)); border-radius: 999px; }

.info-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
@media (min-width: 768px) { .info-grid { grid-template-columns: 1fr 1fr; column-gap: 1.5rem; } }
.info-cell { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.5rem; align-items: start; padding: 0.55rem 0; border-bottom: 1px solid var(--bd-soft); }
.info-k { font-size: 0.78rem; color: var(--muted); }
.info-v { font-size: 0.82rem; color: var(--txt); word-break: break-all; }
.info-link { color: var(--ink); text-decoration: none; }
.info-link:hover { text-decoration: underline; }

.ind-row { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 768px) { .ind-row { grid-template-columns: 1fr 1fr; align-items: center; } }
.ind-list { display: flex; flex-direction: column; gap: 0.1rem; max-height: 240px; overflow-y: auto; }
.ind-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.2rem; border-bottom: 1px solid var(--bd-soft); font-size: 0.82rem; }
.ind-dot { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
.ind-name { color: var(--txt); }
.ind-w { margin-left: auto; font-weight: 600; color: var(--txt); }
</style>
