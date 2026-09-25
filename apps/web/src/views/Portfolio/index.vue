<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { CreateLotForm, CreateSellForm, Holding, HoldingLot, SellTransaction } from '@tw-stock-hub/types'
import { AppAlertDialog, AppButton, ChangePercent, EmptyState, LoadingSkeleton } from '@tw-stock-hub/ui'
import { PieChart } from '@tw-stock-hub/charts'
import { usePortfolioStore } from '@/stores/portfolio.store'
import LotFormModal from './LotFormModal.vue'
import SellFormModal from './SellFormModal.vue'
import TradeDetail from './TradeDetail.vue'
import { money, pnlClass } from './format'

const store = usePortfolioStore()
const { holdings, closed, totals, isLoading, error } = storeToRefs(store)

/** 目前展開明細的股票（持股或已出清皆可） */
const expanded = ref<string | null>(null)
/** 任何異動後遞增，讓展開中的明細重新載入 */
const reloadToken = ref(0)
const actionError = ref<string | null>(null)

const formOpen = ref(false)
const editingLot = ref<HoldingLot | null>(null)
const sellFormOpen = ref(false)
const editingSell = ref<SellTransaction | null>(null)
const sellStock = ref<Holding | null>(null)

type DeleteTarget = { kind: 'lot'; item: HoldingLot } | { kind: 'sell'; item: SellTransaction }
const deleteTarget = ref<DeleteTarget | null>(null)

/** 取後端錯誤訊息（例如 409 超賣說明），沒有則用預設文字 */
const apiError = (e: unknown, fallback: string) => {
  const msg = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  return typeof msg === 'string' ? msg : fallback
}

onMounted(() => { void store.fetchHoldings() })

const allocation = computed(() =>
  holdings.value
    .filter((h) => h.weight !== null)
    .sort((a, b) => b.weight! - a.weight!)
    .map((h) => ({ name: `${h.stockId} ${h.name}`, value: h.weight! })),
)

function toggle(stockId: string): void {
  expanded.value = expanded.value === stockId ? null : stockId
}

/** 異動後：股票已完全沒有紀錄就收合，否則重新載入明細 */
function refreshExpanded(): void {
  const id = expanded.value
  if (!id) return
  const stillListed = holdings.value.some((h) => h.stockId === id) || closed.value.some((c) => c.stockId === id)
  if (stillListed) reloadToken.value++
  else expanded.value = null
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
  refreshExpanded()
}

function openSell(h: Holding): void {
  sellStock.value = h
  editingSell.value = null
  sellFormOpen.value = true
}

function openEditSell(sell: SellTransaction): void {
  sellStock.value = holdings.value.find((h) => h.stockId === sell.stockId) ?? null
  editingSell.value = sell
  sellFormOpen.value = true
}

async function submitSell(form: CreateSellForm): Promise<void> {
  if (editingSell.value) {
    const { stockId: _ignored, ...patch } = form
    await store.updateSell(editingSell.value.id, patch)
  } else {
    await store.addSell(form)
  }
  refreshExpanded()
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  deleteTarget.value = null
  actionError.value = null
  try {
    if (target.kind === 'lot') await store.removeLot(target.item.id)
    else await store.removeSell(target.item.id)
    refreshExpanded()
  } catch (e) {
    console.warn('[Portfolio] delete failed', e)
    actionError.value = apiError(e, '刪除失敗，請稍後再試')
  }
}

const deleteDescription = computed(() => {
  const t = deleteTarget.value
  if (!t) return ''
  return t.kind === 'lot'
    ? `買入 ${t.item.boughtAt}　${t.item.stockId}　${t.item.shares} 股 @ ${t.item.price}`
    : `賣出 ${t.item.soldAt}　${t.item.stockId}　${t.item.shares} 股 @ ${t.item.price}`
})
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
      v-else-if="!holdings.length && !closed.length && !error"
      title="還沒有持股紀錄"
      description="點右上角「記錄買入」新增第一筆買入批次"
      icon="chart"
    />

    <template v-else-if="totals">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
          <span class="stat-label">已實現損益</span>
          <span
            class="stat-value font-mono"
            :class="pnlClass(totals.realizedPnl)"
          >{{ money(totals.realizedPnl) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">未實現報酬率</span>
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
                <th class="py-2 pr-3 text-right">
                  報酬率
                </th>
                <th class="py-2 text-right">
                  已實現
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
                  @click="toggle(h.stockId)"
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
                  <td class="py-2.5 pr-3 text-right font-mono">
                    <ChangePercent :value="h.returnPct" />
                  </td>
                  <td
                    class="py-2.5 text-right font-mono"
                    :class="pnlClass(h.realizedPnl)"
                  >
                    {{ money(h.realizedPnl) }}
                  </td>
                </tr>
                <tr v-if="expanded === h.stockId">
                  <td
                    colspan="8"
                    class="space-y-3 bg-gray-50 px-3 py-3"
                  >
                    <div class="flex justify-end">
                      <AppButton
                        size="sm"
                        variant="outline"
                        @click.stop="openSell(h)"
                      >
                        記錄賣出
                      </AppButton>
                    </div>
                    <TradeDetail
                      :stock-id="h.stockId"
                      :reload-token="reloadToken"
                      @edit-lot="openEdit"
                      @delete-lot="(lot) => (deleteTarget = { kind: 'lot', item: lot })"
                      @edit-sell="openEditSell"
                      @delete-sell="(sell) => (deleteTarget = { kind: 'sell', item: sell })"
                    />
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

    <section
      v-if="closed.length"
      class="card"
    >
      <h2 class="mb-2 text-sm font-semibold text-gray-700">
        已出清
      </h2>
      <ul class="divide-y divide-gray-100 text-sm">
        <li
          v-for="c in closed"
          :key="c.stockId"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between py-2 text-left hover:bg-gray-50"
            :aria-expanded="expanded === c.stockId"
            @click="toggle(c.stockId)"
          >
            <span>
              <span class="font-mono font-semibold text-gray-800">{{ c.stockId }}</span>
              <span class="ml-2 text-gray-600">{{ c.name }}</span>
            </span>
            <span
              class="font-mono"
              :class="pnlClass(c.realizedPnl)"
            >已實現 {{ money(c.realizedPnl) }}</span>
          </button>
          <div
            v-if="expanded === c.stockId"
            class="bg-gray-50 px-3 py-3"
          >
            <TradeDetail
              :stock-id="c.stockId"
              :reload-token="reloadToken"
              @edit-lot="openEdit"
              @delete-lot="(lot) => (deleteTarget = { kind: 'lot', item: lot })"
              @edit-sell="openEditSell"
              @delete-sell="(sell) => (deleteTarget = { kind: 'sell', item: sell })"
            />
          </div>
        </li>
      </ul>
    </section>

    <SellFormModal
      :open="sellFormOpen"
      :stock-id="editingSell?.stockId ?? sellStock?.stockId ?? ''"
      :sell="editingSell"
      :held-shares="sellStock?.shares"
      :submit="submitSell"
      @close="sellFormOpen = false"
    />

    <LotFormModal
      :open="formOpen"
      :lot="editingLot"
      :submit="submitLot"
      @close="formOpen = false"
    />

    <AppAlertDialog
      :open="!!deleteTarget"
      :title="deleteTarget?.kind === 'sell' ? '刪除這筆賣出紀錄？' : '刪除這筆買入批次？'"
      :description="deleteDescription"
      confirm-text="刪除"
      danger
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
