<script setup lang="ts">
// 策略回測（#23、#35）：選策略與參數、費用開關；結果含總費用，進出場點標在 K 線
import { computed, onMounted, ref } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { BacktestResult, BacktestStrategy, BacktestStrategyInfo, DailyQuote } from '@tw-stock-hub/types'
import { KLineChart, type ChartMarker } from '@tw-stock-hub/charts'
import { AppButton, AppInput, AppSelect, DataTable } from '@tw-stock-hub/ui'
import { useChartPrefs } from '@/composables/useChartPrefs'

const props = defineProps<{ stockId: string }>()

type Interval = 'daily' | 'weekly' | 'monthly'

const { params: chartPrefs } = useChartPrefs()

const strategies = ref<BacktestStrategyInfo[]>([])
const strategy = ref<BacktestStrategy>('ma_cross')
const values = ref<Record<string, number>>({})
const from = ref('')
const to = ref('')
const fees = ref(true)
const loading = ref(false)
const error = ref('')
const result = ref<BacktestResult | null>(null)
const bars = ref<DailyQuote[]>([])
const interval = ref<Interval>('daily')

const RULES: Record<BacktestStrategy, string> = {
  ma_cross: '快線上穿慢線於次日開盤進場，下穿於次日開盤出場。',
  kd_cross: 'K 上穿 D 於次日開盤進場，K 下穿 D 於次日開盤出場。',
  macd_cross: 'DIF 上穿 DEA（訊號線）於次日開盤進場，下穿於次日開盤出場。',
  breakout: '收盤突破前 N 日最高價於次日開盤進場，跌破前 M 日最低價於次日開盤出場。',
  rsi_rebound: 'RSI 由超賣線下方回升穿越超賣線於次日開盤進場，RSI 達出場線於次日開盤出場。',
}

const current = computed(() => strategies.value.find((s) => s.key === strategy.value))
const strategyOptions = computed(() => strategies.value.map((s) => ({ value: s.key, label: s.label })))

function resetParams(): void {
  values.value = Object.fromEntries((current.value?.params ?? []).map((p) => [p.key, p.default]))
}

onMounted(async () => {
  try {
    strategies.value = await stockApi.getBacktestStrategies()
    resetParams()
  } catch (e) {
    console.warn('[Backtest] strategies load failed', e)
    error.value = '策略清單載入失敗'
  }
})

function onStrategyChange(v: BacktestStrategy): void {
  strategy.value = v
  resetParams()
  result.value = null
}

async function run(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await stockApi.runBacktest({
      stockId: props.stockId,
      strategy: strategy.value,
      ...values.value,
      fees: fees.value,
      from: from.value || undefined,
      to: to.value || undefined,
    })
    result.value = res
    await loadBars()
  } catch (e) {
    error.value = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '回測失敗，請確認參數與日期'
    result.value = null
  } finally {
    loading.value = false
  }
}

// K 線：回測區間超過約兩年改用週線（API 單次最多 500 根）
const dayMs = 86_400_000
async function loadBars(next?: Interval): Promise<void> {
  const r = result.value
  if (!r) return
  const end = to.value || new Date().toISOString().slice(0, 10)
  const start = from.value || r.trades[0]?.entryDate || new Date(Date.parse(end) - 365 * dayMs).toISOString().slice(0, 10)
  interval.value = next ?? ((Date.parse(end) - Date.parse(start)) / dayMs > 700 ? 'weekly' : 'daily')
  try {
    bars.value = await stockApi.getStockQuote(props.stockId, { interval: interval.value, from: start, to: end, limit: 500 })
  } catch (e) {
    console.warn('[Backtest] quotes load failed', e)
    bars.value = []
  }
}

const markers = computed<ChartMarker[]>(() =>
  (result.value?.trades ?? []).flatMap((t) => [
    { date: t.entryDate, side: 'bull' as const, label: `買進 ${t.entryPrice}` },
    { date: t.exitDate, side: 'bear' as const, label: `賣出 ${t.exitPrice}（${t.returnPct > 0 ? '+' : ''}${t.returnPct}%）` },
  ]),
)

const columns = [
  { key: 'entryDate', label: '進場日', align: 'left' as const },
  { key: 'entryPrice', label: '進場價', align: 'right' as const },
  { key: 'exitDate', label: '出場日', align: 'left' as const },
  { key: 'exitPrice', label: '出場價', align: 'right' as const },
  { key: 'shares', label: '股數', align: 'right' as const },
  { key: 'fees', label: '費用', align: 'right' as const },
  { key: 'returnPct', label: '報酬率%', align: 'right' as const },
]
const money = (v: number) => Math.round(v).toLocaleString('en-US')
</script>

<template>
  <div class="space-y-4">
    <div class="fund-sec">
      <div class="fund-hd">
        策略回測
      </div>
      <div class="bt-form">
        <AppSelect
          :model-value="strategy"
          label="策略"
          :options="strategyOptions"
          @update:model-value="onStrategyChange($event as BacktestStrategy)"
        />
        <AppInput
          v-for="p in current?.params ?? []"
          :key="`${strategy}-${p.key}`"
          v-model.number="values[p.key]"
          :label="`${p.label}（${p.min}–${p.max}）`"
          type="number"
        />
        <AppInput
          v-model="from"
          label="起始日期"
          placeholder="YYYY-MM-DD"
        />
        <AppInput
          v-model="to"
          label="結束日期"
          placeholder="YYYY-MM-DD"
        />
        <label class="bt-check">
          <input
            v-model="fees"
            type="checkbox"
          >
          計入手續費與證交稅
        </label>
        <AppButton
          :loading="loading"
          :disabled="!current"
          @click="run"
        >
          執行回測
        </AppButton>
      </div>
      <p class="fund-note">
        {{ RULES[strategy] }}整股全額進出，期末未平倉以最後收盤結算。
        費用：手續費 0.1425%（整股最低 20 元）、證交稅 0.3%（ETF 0.1%），未計券商折扣。
      </p>
      <p
        v-if="error"
        role="alert"
        class="fund-note is-dn"
      >
        {{ error }}
      </p>
    </div>

    <template v-if="result">
      <div class="kpi-grid">
        <div class="kpi">
          <span class="kpi-k">交易次數</span>
          <span class="kpi-v">{{ result.tradeCount }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">勝率</span>
          <span
            class="kpi-v"
            :class="result.winRate >= 50 ? 'is-up' : 'is-dn'"
          >{{ result.winRate }}</span>
          <span class="kpi-x">%</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">總報酬率</span>
          <span
            class="kpi-v"
            :class="result.totalReturnPct >= 0 ? 'is-up' : 'is-dn'"
          >{{ result.totalReturnPct }}</span>
          <span class="kpi-x">%</span>
        </div>
        <div class="kpi">
          <span class="kpi-k">最大回落</span>
          <span class="kpi-v is-dn">{{ result.maxDrawdownPct }}</span>
          <span class="kpi-x">%</span>
        </div>
      </div>

      <KLineChart
        v-if="bars.length"
        :data="bars"
        :markers="markers"
        :indicator-params="chartPrefs"
        :interval="interval"
        :height="340"
        @interval-change="loadBars($event)"
      />

      <div class="fund-sec">
        <div class="fund-hd-row">
          <span class="fund-hd">交易明細</span>
          <span class="fund-hd-side">
            {{ result.fees ? `總費用 ${money(result.totalFees)} · ` : '未計費用 · ' }}最終資金 {{ money(result.finalCapital) }}
          </span>
        </div>
        <DataTable
          :columns="columns"
          :data="result.trades"
          row-key="entryDate"
          empty-text="區間內沒有交易"
        >
          <template #cell-shares="{ value }">
            <span class="font-mono text-xs">{{ (value as number).toLocaleString() }}</span>
          </template>
          <template #cell-fees="{ value }">
            <span class="font-mono text-xs">{{ money(value as number) }}</span>
          </template>
          <template #cell-returnPct="{ value }">
            <span
              class="font-mono text-xs"
              :class="(value as number) > 0 ? 'is-up' : (value as number) < 0 ? 'is-dn' : ''"
            >{{ value }}</span>
          </template>
        </DataTable>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bt-form { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
.bt-form > * { min-width: 8rem; }
.bt-check { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; font-size: 0.9rem; cursor: pointer; }
.bt-check input { width: 1.1rem; height: 1.1rem; accent-color: var(--ink); }
</style>
