<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi } from '@tw-stock-hub/api-client'
import { screenerFilterSchema } from '@tw-stock-hub/zod-schemas'
import type { ScreenerResult, Market } from '@tw-stock-hub/types'
import {
  DataTable, AppInput, AppSelect, AppButton,
  ChangePercent, LoadingSkeleton, EmptyState, useStaggerIn,
} from '@tw-stock-hub/ui'

const router = useRouter()
const rootEl = ref<HTMLElement>()
useStaggerIn(rootEl, '.card')

const results = ref<ScreenerResult[]>([])
const total = ref(0)
const isLoading = ref(false)
const hasSearched = ref(false)
const errors = ref<Record<string, string>>({})

const filter = reactive({
  priceMin: '' as string | number,
  priceMax: '' as string | number,
  changeMin: '' as string | number,
  changeMax: '' as string | number,
  volumeMin: '' as string | number,
  foreignNetMin: '' as string | number,
  trustNetMin: '' as string | number,
  marginChangeMin: '' as string | number,
  market: 'ALL' as Market,
  sector: '',
})

const marketOptions = [
  { label: '全部', value: 'ALL' },
  { label: '上市 TWSE', value: 'TWSE' },
  { label: '上櫃 TPEX', value: 'TPEX' },
]

const columns = [
  { key: 'stockId', label: '代號', align: 'left' as const },
  { key: 'stockName', label: '名稱', align: 'left' as const },
  { key: 'market', label: '市場', align: 'center' as const },
  { key: 'close', label: '收盤', align: 'right' as const, sortable: true },
  { key: 'changePct', label: '漲跌幅', align: 'right' as const, sortable: true },
  { key: 'volume', label: '成交量(張)', align: 'right' as const, sortable: true },
  { key: 'foreignNet', label: '外資', align: 'right' as const, sortable: true },
]

function buildFilterPayload() {
  const toNum = (v: string | number) => v === '' ? undefined : Number(v)
  return {
    priceMin: toNum(filter.priceMin),
    priceMax: toNum(filter.priceMax),
    changeMin: toNum(filter.changeMin),
    changeMax: toNum(filter.changeMax),
    volumeMin: toNum(filter.volumeMin),
    foreignNetMin: toNum(filter.foreignNetMin),
    trustNetMin: toNum(filter.trustNetMin),
    marginChangeMin: toNum(filter.marginChangeMin),
    market: filter.market !== 'ALL' ? filter.market : undefined,
    sector: filter.sector || undefined,
  }
}

async function onSubmit(): Promise<void> {
  errors.value = {}

  const payload = buildFilterPayload()
  const result = screenerFilterSchema.safeParse(payload)

  if (!result.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0]?.toString() ?? 'general'
      fieldErrors[field] = issue.message
    }
    errors.value = fieldErrors
    return
  }

  isLoading.value = true
  hasSearched.value = true
  try {
    const res = await stockApi.screenStocks(result.data)
    results.value = res.items
    total.value = res.total
  } catch (e) {
    console.warn('[Screener] search failed', e)
  } finally {
    isLoading.value = false
  }
}

function onReset(): void {
  Object.assign(filter, {
    priceMin: '', priceMax: '',
    changeMin: '', changeMax: '',
    volumeMin: '', foreignNetMin: '',
    trustNetMin: '', marginChangeMin: '',
    market: 'ALL', sector: '',
  })
  results.value = []
  total.value = 0
  hasSearched.value = false
  errors.value = {}
}

function goToStock(id: string): void {
  void router.push({ name: 'stock-detail', params: { id } })
}

function exportCsv(): void {
  const headers = ['代號', '名稱', '市場', '收盤', '漲跌幅%', '成交量(張)', '外資淨買超']
  const rows = results.value.map(r => [
    r.stockId, r.stockName, r.market,
    r.close.toFixed(2),
    r.changePct?.toFixed(2) ?? '',
    r.volume,
    r.foreignNet ?? '',
  ])

  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${v}"`).join(','))
    .join('\n')

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `選股結果_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function toChangePct(v: unknown): number | null {
  return v as number | null
}

function fmtAmt(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}億`
  return `${v >= 0 ? '+' : ''}${v.toLocaleString()}`
}
</script>

<template>
  <div
    ref="rootEl"
    class="space-y-6"
  >
    <header class="page-head">
      <div>
        <h1 class="page-head-title">選股篩選器</h1>
        <div class="page-head-sub">SCREENER</div>
      </div>
      <div class="page-head-meta">多條件篩選台股</div>
    </header>

    <div class="card">
      <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
            股價範圍（元）
          </p>
          <div class="flex items-center gap-2">
            <AppInput
              v-model="filter.priceMin"
              placeholder="最低"
              type="number"
              :error="errors['priceMin']"
            />
            <span class="text-gray-300">~</span>
            <AppInput
              v-model="filter.priceMax"
              placeholder="最高"
              type="number"
              :error="errors['priceMax']"
            />
          </div>
        </div>

        <div>
          <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
            漲跌幅（%）
          </p>
          <div class="flex items-center gap-2">
            <AppInput
              v-model="filter.changeMin"
              placeholder="-10"
              type="number"
              :error="errors['changeMin']"
            />
            <span class="text-gray-300">~</span>
            <AppInput
              v-model="filter.changeMax"
              placeholder="+10"
              type="number"
              :error="errors['changeMax']"
            />
          </div>
        </div>

        <AppInput
          v-model="filter.volumeMin"
          label="最小成交量（張）"
          placeholder="例：1000"
          type="number"
          :error="errors['volumeMin']"
        />

        <AppInput
          v-model="filter.foreignNetMin"
          label="外資淨買超下限（億）"
          placeholder="例：1"
          type="number"
          :error="errors['foreignNetMin']"
        />

        <AppInput
          v-model="filter.trustNetMin"
          label="投信淨買超下限（億）"
          placeholder="例：0.5"
          type="number"
          :error="errors['trustNetMin']"
        />

        <AppSelect
          v-model="filter.market"
          :options="marketOptions"
          label="市場別"
        />
      </div>

      <div class="flex items-center gap-3">
        <AppButton
          :loading="isLoading"
          type="button"
          @click="onSubmit"
        >
          開始篩選
        </AppButton>
        <AppButton
          variant="ghost"
          type="button"
          @click="onReset"
        >
          清除條件
        </AppButton>
      </div>
    </div>

    <div
      v-if="hasSearched"
      class="card p-0"
    >
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <span class="text-sm text-gray-500">
          找到 <strong class="text-gray-900">{{ total }}</strong> 支符合條件
          <span
            v-if="total >= 200"
            class="ml-1 text-xs text-[#9a6416]"
          >（顯示前 200 筆）</span>
        </span>
        <AppButton
          v-if="results.length > 0"
          variant="outline"
          size="sm"
          @click="exportCsv"
        >
          ↓ 匯出 CSV
        </AppButton>
      </div>
      <div class="p-2">
        <LoadingSkeleton
          v-if="isLoading"
          type="table"
          :rows="10"
        />
        <EmptyState
          v-else-if="results.length === 0"
          title="無符合條件的股票"
          description="請調整篩選條件後重新搜尋"
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
            <span class="font-mono text-sm font-semibold text-ink cursor-pointer hover:underline">{{ value }}</span>
          </template>
          <template #cell-close="{ value }">
            <span class="font-mono text-sm">{{ (value as number).toFixed(2) }}</span>
          </template>
          <template #cell-changePct="{ value }">
            <ChangePercent :value="toChangePct(value)" />
          </template>
          <template #cell-volume="{ value }">
            <span class="font-mono text-xs">{{ (value as number).toLocaleString() }}</span>
          </template>
          <template #cell-foreignNet="{ value }">
            <span
              v-if="value != null"
              :class="['font-mono text-xs', (value as number) >= 0 ? 'text-up' : 'text-down']"
            >{{ fmtAmt(value as number) }}</span>
            <span
              v-else
              class="text-gray-300"
            >—</span>
          </template>
        </DataTable>
      </div>
    </div>
  </div>
</template>
