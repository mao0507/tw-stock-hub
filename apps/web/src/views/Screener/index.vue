<script setup lang="ts">
// 選股器（#21）：行情籌碼、技術趨勢、基本面三面向，條件 AND 組合
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi } from '@tw-stock-hub/api-client'
import { screenerFilterSchema } from '@tw-stock-hub/zod-schemas'
import type { ScreenerResult, ScreenerSortKey, Market } from '@tw-stock-hub/types'
import {
  DataTable, AppInput, AppSelect, AppButton,
  ChangePercent, LoadingSkeleton, EmptyState,
} from '@tw-stock-hub/ui'

const router = useRouter()

const results = ref<ScreenerResult[]>([])
const total = ref(0)
const isLoading = ref(false)
const hasSearched = ref(false)
const loadError = ref('')
const errors = ref<Record<string, string>>({})

type NumField =
  | 'priceMin' | 'priceMax' | 'changeMin' | 'changeMax' | 'volumeMin'
  | 'foreignNetMin' | 'trustNetMin' | 'marginChangeMin' | 'rsMin'
  | 'peMin' | 'peMax' | 'pbMax' | 'yieldMin' | 'grossMarginMin' | 'revenueYoyMin'
  | 'dividendYearsMin' | 'bigHolderMin'
const NUM_FIELDS: NumField[] = [
  'priceMin', 'priceMax', 'changeMin', 'changeMax', 'volumeMin',
  'foreignNetMin', 'trustNetMin', 'marginChangeMin', 'rsMin',
  'peMin', 'peMax', 'pbMax', 'yieldMin', 'grossMarginMin', 'revenueYoyMin',
  'dividendYearsMin', 'bigHolderMin',
]

const empty = () => ({
  ...Object.fromEntries(NUM_FIELDS.map((k) => [k, ''])) as Record<NumField, string | number>,
  market: 'ALL' as Market,
  bullishAlignment: false,
  aboveMa20: false,
  aboveMa60: false,
  sortBy: 'volume' as ScreenerSortKey,
})
const filter = reactive(empty())

const PRESETS: { label: string; desc: string; set: Partial<ReturnType<typeof empty>> }[] = [
  { label: '穩定存股', desc: '連續配息 ≥ 5 年、殖利率 ≥ 4%、本益比 ≤ 20', set: { dividendYearsMin: 5, yieldMin: 4, peMax: 20, sortBy: 'dividendYield' } },
  { label: '強勢趨勢', desc: '均線多頭排列、RS ≥ 80', set: { bullishAlignment: true, rsMin: 80, sortBy: 'rsScore' } },
  { label: '法人加碼', desc: '外資買超 ≥ 500 張、站上 MA20', set: { foreignNetMin: 500, aboveMa20: true, sortBy: 'foreignNet' } },
]

const marketOptions = [
  { label: '全部', value: 'ALL' },
  { label: '上市', value: 'TWSE' },
  { label: '上櫃', value: 'TPEX' },
]
const sortOptions: { label: string; value: ScreenerSortKey }[] = [
  { label: '成交量', value: 'volume' },
  { label: '漲跌幅', value: 'changePct' },
  { label: '外資買超', value: 'foreignNet' },
  { label: 'RS 強弱', value: 'rsScore' },
  { label: '殖利率', value: 'dividendYield' },
  { label: '本益比（低到高）', value: 'pe' },
  { label: '毛利率', value: 'grossMargin' },
  { label: '營收年增', value: 'revenueYoy' },
  { label: '連續配息年數', value: 'dividendYears' },
]

const columns = [
  { key: 'stockId', label: '代號', align: 'left' as const },
  { key: 'stockName', label: '名稱', align: 'left' as const },
  { key: 'close', label: '收盤', align: 'right' as const, sortable: true },
  { key: 'changePct', label: '漲跌幅', align: 'right' as const, sortable: true },
  { key: 'volume', label: '成交量(張)', align: 'right' as const, sortable: true },
  { key: 'foreignNet', label: '外資(張)', align: 'right' as const, sortable: true },
  { key: 'rsScore', label: 'RS', align: 'right' as const, sortable: true },
  { key: 'pe', label: '本益比', align: 'right' as const, sortable: true },
  { key: 'dividendYield', label: '殖利率%', align: 'right' as const, sortable: true },
  { key: 'grossMargin', label: '毛利率%', align: 'right' as const, sortable: true },
  { key: 'revenueYoy', label: '營收年增%', align: 'right' as const, sortable: true },
  { key: 'dividendYears', label: '連配(年)', align: 'right' as const, sortable: true },
]

function buildPayload() {
  const nums = Object.fromEntries(
    NUM_FIELDS.map((k) => [k, filter[k] === '' ? undefined : Number(filter[k])]),
  )
  return {
    ...nums,
    market: filter.market !== 'ALL' ? filter.market : undefined,
    bullishAlignment: filter.bullishAlignment || undefined,
    aboveMa20: filter.aboveMa20 || undefined,
    aboveMa60: filter.aboveMa60 || undefined,
  }
}

async function onSubmit(): Promise<void> {
  errors.value = {}
  loadError.value = ''
  const parsed = screenerFilterSchema.safeParse(buildPayload())
  if (!parsed.success) {
    errors.value = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? 'general'), i.message]))
    return
  }
  isLoading.value = true
  hasSearched.value = true
  try {
    const res = await stockApi.screenStocks({
      ...parsed.data,
      sortBy: filter.sortBy,
      order: filter.sortBy === 'pe' ? 'asc' : 'desc',
    })
    results.value = res.items
    total.value = res.total
  } catch (e) {
    console.warn('[Screener] search failed', e)
    loadError.value = '篩選失敗，請稍後再試'
    results.value = []
    total.value = 0
  } finally {
    isLoading.value = false
  }
}

function applyPreset(set: Partial<ReturnType<typeof empty>>): void {
  Object.assign(filter, empty(), set)
  void onSubmit()
}

function onReset(): void {
  Object.assign(filter, empty())
  results.value = []
  total.value = 0
  hasSearched.value = false
  errors.value = {}
  loadError.value = ''
}

function goToStock(id: string): void {
  void router.push({ name: 'stock-detail', params: { id } })
}

function exportCsv(): void {
  const headers = columns.map((c) => c.label)
  const rows = results.value.map((r) => columns.map((c) => r[c.key as keyof ScreenerResult] ?? ''))
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v)}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `選股結果_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const asNum = (v: unknown) => (v == null ? null : Number(v))
const fmt = (v: unknown, dp = 2) => (v == null ? '—' : (v as number).toLocaleString('en-US', { maximumFractionDigits: dp }))
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">
          選股器
        </h1>
        <div class="page-head-sub">
          SCREENER
        </div>
      </div>
      <div class="page-head-meta">
        行情籌碼 × 技術趨勢 × 基本面，條件同時成立
      </div>
    </header>

    <!-- 快速策略 -->
    <div class="grid gap-3 sm:grid-cols-3">
      <button
        v-for="p in PRESETS"
        :key="p.label"
        type="button"
        class="panel p-4 text-left transition-colors hover:border-ink"
        @click="applyPreset(p.set)"
      >
        <div class="font-display text-base font-extrabold text-gray-900">
          {{ p.label }}
        </div>
        <div class="mt-1 text-xs text-gray-500">
          {{ p.desc }}
        </div>
      </button>
    </div>

    <form
      class="grid gap-5 lg:grid-cols-3"
      @submit.prevent="onSubmit"
    >
      <section class="panel">
        <div class="panel-hd">
          <h2 class="panel-title">
            行情籌碼
          </h2>
        </div>
        <div class="space-y-3 p-4">
          <AppSelect
            v-model="filter.market"
            :options="marketOptions"
            label="市場"
          />
          <div class="grid grid-cols-2 gap-2">
            <AppInput
              v-model="filter.priceMin"
              label="股價下限"
              type="number"
              :error="errors['priceMin']"
            />
            <AppInput
              v-model="filter.priceMax"
              label="股價上限"
              type="number"
              :error="errors['priceMax']"
            />
            <AppInput
              v-model="filter.changeMin"
              label="漲跌幅下限 %"
              type="number"
              :error="errors['changeMin']"
            />
            <AppInput
              v-model="filter.changeMax"
              label="漲跌幅上限 %"
              type="number"
              :error="errors['changeMax']"
            />
          </div>
          <AppInput
            v-model="filter.volumeMin"
            label="成交量下限（張）"
            type="number"
            :error="errors['volumeMin']"
          />
          <div class="grid grid-cols-2 gap-2">
            <AppInput
              v-model="filter.foreignNetMin"
              label="外資買超 ≥（張）"
              type="number"
              :error="errors['foreignNetMin']"
            />
            <AppInput
              v-model="filter.trustNetMin"
              label="投信買超 ≥（張）"
              type="number"
              :error="errors['trustNetMin']"
            />
          </div>
          <AppInput
            v-model="filter.marginChangeMin"
            label="融資增減 ≥（張）"
            type="number"
            :error="errors['marginChangeMin']"
          />
        </div>
      </section>

      <section class="panel">
        <div class="panel-hd">
          <h2 class="panel-title">
            技術趨勢
          </h2>
        </div>
        <div class="space-y-3 p-4">
          <label class="check-row">
            <input
              v-model="filter.bullishAlignment"
              type="checkbox"
            >
            均線多頭排列（MA5 &gt; MA10 &gt; MA20 &gt; MA60）
          </label>
          <label class="check-row">
            <input
              v-model="filter.aboveMa20"
              type="checkbox"
            >
            收盤站上 MA20（月線）
          </label>
          <label class="check-row">
            <input
              v-model="filter.aboveMa60"
              type="checkbox"
            >
            收盤站上 MA60（季線）
          </label>
          <AppInput
            v-model="filter.rsMin"
            label="RS 相對強弱 ≥（1–99）"
            type="number"
            placeholder="例：80"
            :error="errors['rsMin']"
          />
          <p class="text-xs text-gray-500">
            RS 為 20／60／120／250 日加權報酬的全市場百分位，上市未滿一年者無 RS。
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-hd">
          <h2 class="panel-title">
            基本面
          </h2>
        </div>
        <div class="space-y-3 p-4">
          <div class="grid grid-cols-2 gap-2">
            <AppInput
              v-model="filter.peMin"
              label="本益比下限"
              type="number"
              :error="errors['peMin']"
            />
            <AppInput
              v-model="filter.peMax"
              label="本益比上限"
              type="number"
              :error="errors['peMax']"
            />
            <AppInput
              v-model="filter.pbMax"
              label="股價淨值比上限"
              type="number"
              :error="errors['pbMax']"
            />
            <AppInput
              v-model="filter.yieldMin"
              label="殖利率 ≥ %"
              type="number"
              :error="errors['yieldMin']"
            />
            <AppInput
              v-model="filter.grossMarginMin"
              label="毛利率 ≥ %"
              type="number"
              :error="errors['grossMarginMin']"
            />
            <AppInput
              v-model="filter.revenueYoyMin"
              label="營收年增 ≥ %"
              type="number"
              :error="errors['revenueYoyMin']"
            />
            <AppInput
              v-model="filter.dividendYearsMin"
              label="連續配息 ≥ 年"
              type="number"
              :error="errors['dividendYearsMin']"
            />
            <AppInput
              v-model="filter.bigHolderMin"
              label="大戶持股 ≥ %"
              type="number"
              :error="errors['bigHolderMin']"
            />
          </div>
          <p class="text-xs text-gray-500">
            毛利率取最新一季、營收年增取最新月份；沒有資料的股票不會通過該條件。
          </p>
        </div>
      </section>

      <div class="flex flex-wrap items-end gap-3 lg:col-span-3">
        <div class="w-48">
          <AppSelect
            v-model="filter.sortBy"
            :options="sortOptions"
            label="排序"
          />
        </div>
        <AppButton
          :loading="isLoading"
          type="submit"
        >
          開始篩選
        </AppButton>
        <AppButton
          variant="outline"
          type="button"
          @click="onReset"
        >
          清除條件
        </AppButton>
      </div>
    </form>

    <section
      v-if="hasSearched"
      class="panel"
    >
      <div class="panel-hd items-center">
        <span class="text-sm text-gray-700">
          找到 <strong class="font-mono text-gray-900">{{ total }}</strong> 檔
          <span
            v-if="total > results.length"
            class="ml-1 text-xs text-[#9a6416]"
          >（顯示前 {{ results.length }} 筆）</span>
        </span>
        <AppButton
          v-if="results.length > 0"
          variant="outline"
          size="sm"
          @click="exportCsv"
        >
          匯出 CSV
        </AppButton>
      </div>
      <div class="scroll-x p-2">
        <LoadingSkeleton
          v-if="isLoading"
          type="table"
          :rows="10"
        />
        <p
          v-else-if="loadError"
          role="alert"
          class="p-4 text-sm text-red-700"
        >
          {{ loadError }}
        </p>
        <EmptyState
          v-else-if="results.length === 0"
          title="無符合條件的股票"
          description="請放寬條件後重新篩選"
          icon="filter"
        />
        <DataTable
          v-else
          :columns="columns"
          :data="results"
          row-key="stockId"
          :on-row-click="(row) => goToStock(String(row['stockId']))"
        >
          <template #cell-stockId="{ value }">
            <span class="font-mono text-sm font-semibold text-ink">{{ value }}</span>
          </template>
          <template #cell-close="{ value }">
            <span class="font-mono text-sm">{{ fmt(value) }}</span>
          </template>
          <template #cell-changePct="{ value }">
            <ChangePercent :value="asNum(value)" />
          </template>
          <template #cell-volume="{ value }">
            <span class="font-mono text-xs">{{ fmt(value, 0) }}</span>
          </template>
          <template #cell-foreignNet="{ value }">
            <span
              class="font-mono text-xs"
              :class="value == null ? 'text-gray-400' : (value as number) >= 0 ? 'text-up' : 'text-down'"
            >{{ value == null ? '—' : `${(value as number) > 0 ? '+' : ''}${fmt(value, 0)}` }}</span>
          </template>
          <template #cell-rsScore="{ value }">
            <span class="font-mono text-xs">{{ value ?? '—' }}</span>
          </template>
          <template #cell-pe="{ value }">
            <span class="font-mono text-xs">{{ fmt(value) }}</span>
          </template>
          <template #cell-dividendYield="{ value }">
            <span class="font-mono text-xs">{{ fmt(value) }}</span>
          </template>
          <template #cell-grossMargin="{ value }">
            <span class="font-mono text-xs">{{ fmt(value) }}</span>
          </template>
          <template #cell-revenueYoy="{ value }">
            <span
              class="font-mono text-xs"
              :class="value == null ? 'text-gray-400' : (value as number) >= 0 ? 'text-up' : 'text-down'"
            >{{ fmt(value) }}</span>
          </template>
          <template #cell-dividendYears="{ value }">
            <span class="font-mono text-xs">{{ value }}</span>
          </template>
        </DataTable>
      </div>
    </section>
  </div>
</template>

<style scoped>
.check-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 44px;
  font-size: 0.9rem;
  color: var(--txt);
  cursor: pointer;
}
.check-row input { width: 1.1rem; height: 1.1rem; accent-color: var(--ink); }
</style>
