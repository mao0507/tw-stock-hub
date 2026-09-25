<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { portfolioApi } from '@tw-stock-hub/api-client'
import type { CreateLotForm, Holding, HoldingLot } from '@tw-stock-hub/types'
import { AppAlertDialog, AppButton, ChangePercent, EmptyState, LoadingSkeleton } from '@tw-stock-hub/ui'
import { PieChart } from '@tw-stock-hub/charts'
import { usePortfolioStore } from '@/stores/portfolio.store'
import LotFormModal from './LotFormModal.vue'

const store = usePortfolioStore()
const { holdings, totals, isLoading, error } = storeToRefs(store)

const expanded = ref<string | null>(null)
const lots = ref<HoldingLot[]>([])
const lotsLoading = ref(false)
const lotsError = ref<string | null>(null)
const actionError = ref<string | null>(null)

const formOpen = ref(false)
const editingLot = ref<HoldingLot | null>(null)
const deleteTarget = ref<HoldingLot | null>(null)

onMounted(() => { void store.fetchHoldings() })

const money = (n: number | null, dp = 0) =>
  n === null ? '—' : n.toLocaleString('zh-TW', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const pnlClass = (n: number | null) => (n === null || n === 0 ? 'text-gray-500' : n > 0 ? 'text-up' : 'text-down')

const allocation = computed(() =>
  holdings.value
    .filter((h) => h.weight !== null)
    .sort((a, b) => b.weight! - a.weight!)
    .map((h) => ({ name: `${h.stockId} ${h.name}`, value: h.weight! })),
)

async function loadLots(stockId: string): Promise<void> {
  lots.value = []
  lotsError.value = null
  lotsLoading.value = true
  try {
    const data = await portfolioApi.listLots(stockId)
    // 快速切換展開列時，較慢回來的舊請求不可覆蓋目前這列
    if (expanded.value === stockId) lots.value = data
  } catch (e) {
    console.warn('[Portfolio] listLots failed', e)
    if (expanded.value === stockId) lotsError.value = '批次載入失敗，請重新展開'
  } finally {
    if (expanded.value === stockId) lotsLoading.value = false
  }
}

async function toggle(h: Holding): Promise<void> {
  if (expanded.value === h.stockId) {
    expanded.value = null
    return
  }
  expanded.value = h.stockId
  await loadLots(h.stockId)
}

function openCreate(): void {
  editingLot.value = null
  formOpen.value = true
}

function openEdit(lot: HoldingLot): void {
  editingLot.value = lot
  formOpen.value = true
}

async function submitLot(form: CreateLotForm): Promise<void> {
  if (editingLot.value) {
    const { stockId: _ignored, ...patch } = form
    await store.updateLot(editingLot.value.id, patch)
  } else {
    await store.addLot(form)
  }
  if (expanded.value) await refreshExpanded()
}

async function refreshExpanded(): Promise<void> {
  const id = expanded.value
  if (!id) return
  if (!holdings.value.some((h) => h.stockId === id)) {
    expanded.value = null
    return
  }
  await loadLots(id)
}

async function confirmDelete(): Promise<void> {
  const lot = deleteTarget.value
  if (!lot) return
  deleteTarget.value = null
  actionError.value = null
  try {
    await store.removeLot(lot.id)
    await refreshExpanded()
  } catch (e) {
    console.warn('[Portfolio] removeLot failed', e)
    actionError.value = '刪除失敗，請稍後再試'
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="font-display text-xl font-bold text-gray-900">
        我的持股
      </h1>
      <AppButton @click="openCreate">
        記錄買入
      </AppButton>
    </div>

    <div
      v-if="error || actionError"
      role="alert"
      class="rounded-lg bg-red-50 p-3 text-sm text-red-600"
    >
      {{ actionError ?? error }}
    </div>

    <LoadingSkeleton
      v-if="isLoading && !holdings.length"
      :rows="4"
    />

    <EmptyState
      v-else-if="!holdings.length && !error"
      title="還沒有持股紀錄"
      description="點右上角「記錄買入」新增第一筆買入批次"
      icon="chart"
    />

    <template v-else-if="totals">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="stat-card">
          <span class="stat-label">總成本</span>
          <span class="stat-value font-mono">{{ money(totals.costBasis) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">總市值</span>
          <span class="stat-value font-mono">{{ money(totals.marketValue) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">未實現損益</span>
          <span
            class="stat-value font-mono"
            :class="pnlClass(totals.unrealizedPnl)"
          >{{ money(totals.unrealizedPnl) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">報酬率</span>
          <ChangePercent
            class="stat-value font-mono"
            :value="totals.returnPct"
          />
        </div>
      </section>

      <p
        v-if="totals.staleCount > 0"
        class="text-xs text-amber-600"
      >
        有 {{ totals.staleCount }} 檔查無最新股價，未計入總市值、損益與配置比例。
      </p>

      <div class="grid gap-4 lg:grid-cols-3">
        <section class="card overflow-x-auto lg:col-span-2">
          <table class="w-full text-sm">
            <thead class="text-left text-xs text-gray-400">
              <tr>
                <th class="py-2 pr-3">
                  股票
                </th>
                <th class="py-2 pr-3 text-right">
                  股數
                </th>
                <th class="py-2 pr-3 text-right">
                  均價
                </th>
                <th class="py-2 pr-3 text-right">
                  現價
                </th>
                <th class="py-2 pr-3 text-right">
                  市值
                </th>
                <th class="py-2 pr-3 text-right">
                  未實現損益
                </th>
                <th class="py-2 text-right">
                  報酬率
                </th>
              </tr>
            </thead>
            <tbody>
              <template
                v-for="h in holdings"
                :key="h.stockId"
              >
                <tr
                  class="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                  :aria-expanded="expanded === h.stockId"
                  @click="toggle(h)"
                >
                  <td class="py-2.5 pr-3">
                    <span class="font-mono font-semibold text-gray-800">{{ h.stockId }}</span>
                    <span class="ml-2 text-gray-600">{{ h.name }}</span>
                  </td>
                  <td class="py-2.5 pr-3 text-right font-mono">
                    {{ money(h.shares) }}
                  </td>
                  <td class="py-2.5 pr-3 text-right font-mono">
                    {{ money(h.avgCost, 2) }}
                  </td>
                  <td class="py-2.5 pr-3 text-right font-mono">
                    <span
                      v-if="h.stale"
                      class="text-amber-600"
                      title="查無最新股價"
                    >無股價</span>
                    <span v-else>{{ money(h.price, 2) }}</span>
                  </td>
                  <td class="py-2.5 pr-3 text-right font-mono">
                    {{ money(h.marketValue) }}
                  </td>
                  <td
                    class="py-2.5 pr-3 text-right font-mono"
                    :class="pnlClass(h.unrealizedPnl)"
                  >
                    {{ money(h.unrealizedPnl) }}
                  </td>
                  <td class="py-2.5 text-right font-mono">
                    <ChangePercent :value="h.returnPct" />
                  </td>
                </tr>
                <tr v-if="expanded === h.stockId">
                  <td
                    colspan="7"
                    class="bg-gray-50 px-3 py-3"
                  >
                    <p
                      v-if="lotsLoading"
                      class="text-xs text-gray-400"
                    >
                      載入批次中…
                    </p>
                    <p
                      v-else-if="lotsError"
                      role="alert"
                      class="text-xs text-red-500"
                    >
                      {{ lotsError }}
                    </p>
                    <table
                      v-else
                      class="w-full text-xs"
                    >
                      <thead class="text-left text-gray-400">
                        <tr>
                          <th class="py-1 pr-3">
                            買入日
                          </th>
                          <th class="py-1 pr-3 text-right">
                            成交價
                          </th>
                          <th class="py-1 pr-3 text-right">
                            股數
                          </th>
                          <th class="py-1 pr-3 text-right">
                            手續費
                          </th>
                          <th class="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="lot in lots"
                          :key="lot.id"
                          class="border-t border-gray-200"
                        >
                          <td class="py-1.5 pr-3 font-mono">
                            {{ lot.boughtAt }}
                          </td>
                          <td class="py-1.5 pr-3 text-right font-mono">
                            {{ money(lot.price, 2) }}
                          </td>
                          <td class="py-1.5 pr-3 text-right font-mono">
                            {{ money(lot.shares) }}
                          </td>
                          <td class="py-1.5 pr-3 text-right font-mono">
                            {{ money(lot.fee) }}
                          </td>
                          <td class="py-1.5 text-right">
                            <AppButton
                              size="sm"
                              variant="ghost"
                              @click.stop="openEdit(lot)"
                            >
                              編輯
                            </AppButton>
                            <AppButton
                              size="sm"
                              variant="ghost"
                              class="text-red-500"
                              @click.stop="deleteTarget = lot"
                            >
                              刪除
                            </AppButton>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </section>

        <section class="card">
          <h2 class="mb-2 text-sm font-semibold text-gray-700">
            配置比例（依市值）
          </h2>
          <PieChart
            v-if="allocation.length"
            :data="allocation"
          />
          <p
            v-else
            class="text-xs text-gray-400"
          >
            尚無可計算市值的持股
          </p>
        </section>
      </div>
    </template>

    <LotFormModal
      :open="formOpen"
      :lot="editingLot"
      :submit="submitLot"
      @close="formOpen = false"
    />

    <AppAlertDialog
      :open="!!deleteTarget"
      title="刪除這筆買入批次？"
      :description="deleteTarget ? `${deleteTarget.boughtAt}　${deleteTarget.stockId}　${deleteTarget.shares} 股 @ ${deleteTarget.price}` : ''"
      confirm-text="刪除"
      danger
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
