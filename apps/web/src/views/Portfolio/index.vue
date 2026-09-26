<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { CreateLotForm, CreateSellForm, Holding, HoldingLot, SellTransaction } from '@tw-stock-hub/types'
import { AppAlertDialog, AppButton, ChangePercent, EmptyState, LoadingSkeleton } from '@tw-stock-hub/ui'
import { PieChart, PIE_PALETTE } from '@tw-stock-hub/charts'
import { usePortfolioStore } from '@/stores/portfolio.store'
import { useMediaQuery } from '@/composables/useMediaQuery'
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

// 桌機表格／手機卡片只渲染其一，避免 TradeDetail 重複掛載、重複打 API
const isDesktop = useMediaQuery('(min-width: 768px)')

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

/** 墨綠摘要卡上的損益色（提亮版） */
const onInk = (n: number | null) => (n === null || n === 0 ? '' : n > 0 ? 'on-up' : 'on-dn')
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">
          我的持股
        </h1>
        <p class="page-head-sub">
          PORTFOLIO · 依買入批次計算
        </p>
      </div>
      <AppButton @click="openCreate">
        記錄買入
      </AppButton>
    </header>

    <div
      v-if="error || actionError"
      role="alert"
      class="rounded-xl bg-red-50 p-3 text-sm text-red-700"
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
      <!-- 帳本摘要（墨綠卡） -->
      <section
        class="summary"
        aria-label="持股摘要"
      >
        <div class="flex flex-col gap-1">
          <span class="text-sm text-white/70">總市值</span>
          <span class="font-mono text-[2.4rem] font-semibold leading-tight sm:text-5xl">{{ money(totals.marketValue) }}</span>
          <span class="font-mono text-base">
            <span :class="onInk(totals.unrealizedPnl)">未實現 {{ totals.unrealizedPnl > 0 ? '+' : '' }}{{ money(totals.unrealizedPnl) }}</span>
            <span
              v-if="totals.returnPct !== null"
              class="ml-2"
              :class="onInk(totals.returnPct)"
            >{{ totals.returnPct > 0 ? '+' : '' }}{{ totals.returnPct.toFixed(2) }}%</span>
          </span>
        </div>
        <dl class="summary-grid">
          <div>
            <dt>總成本</dt>
            <dd>{{ money(totals.costBasis) }}</dd>
          </div>
          <div>
            <dt>已實現損益</dt>
            <dd :class="onInk(totals.realizedPnl)">
              {{ money(totals.realizedPnl) }}
            </dd>
          </div>
          <div>
            <dt>已領股利</dt>
            <dd class="text-[#f0c987]">
              {{ money(totals.earnedDividend) }}
            </dd>
          </div>
          <div>
            <dt>持有檔數</dt>
            <dd>{{ holdings.length }}</dd>
          </div>
        </dl>
      </section>

      <p
        v-if="totals.staleCount > 0"
        class="text-xs text-[#9a6416]"
      >
        有 {{ totals.staleCount }} 檔查無最新股價，未計入總市值、損益與配置比例。
      </p>

      <div class="grid gap-5 xl:grid-cols-3">
        <section class="panel xl:col-span-2">
          <div class="panel-hd">
            <h2 class="panel-title">
              持股明細
            </h2>
            <span class="text-xs text-gray-500">點一檔看買賣紀錄</span>
          </div>

          <!-- 桌機：表格 -->
          <div
            v-if="isDesktop"
            class="scroll-x"
          >
            <table class="table-modern">
              <thead>
                <tr>
                  <th>股票</th>
                  <th class="!text-right">
                    股數
                  </th>
                  <th class="!text-right">
                    均價
                  </th>
                  <th class="!text-right">
                    現價
                  </th>
                  <th class="!text-right">
                    市值
                  </th>
                  <th class="!text-right">
                    未實現損益
                  </th>
                  <th class="!text-right">
                    報酬率
                  </th>
                  <th class="!text-right">
                    已實現
                  </th>
                  <th class="!text-right">
                    已領股利
                  </th>
                </tr>
              </thead>
              <tbody>
                <template
                  v-for="h in holdings"
                  :key="h.stockId"
                >
                  <tr
                    class="cursor-pointer"
                    :aria-expanded="expanded === h.stockId"
                    @click="toggle(h.stockId)"
                  >
                    <td class="whitespace-nowrap">
                      <span class="font-mono font-semibold text-gray-800">{{ h.stockId }}</span>
                      <span class="ml-2 text-gray-700">{{ h.name }}</span>
                    </td>
                    <td class="text-right font-mono">
                      {{ money(h.shares) }}
                    </td>
                    <td class="text-right font-mono">
                      {{ money(h.avgCost, 2) }}
                    </td>
                    <td class="text-right font-mono">
                      <span
                        v-if="h.stale"
                        class="text-[#9a6416]"
                        title="查無最新股價"
                      >無股價</span>
                      <span v-else>{{ money(h.price, 2) }}</span>
                    </td>
                    <td class="text-right font-mono">
                      {{ money(h.marketValue) }}
                    </td>
                    <td
                      class="text-right font-mono"
                      :class="pnlClass(h.unrealizedPnl)"
                    >
                      {{ money(h.unrealizedPnl) }}
                    </td>
                    <td class="text-right font-mono">
                      <ChangePercent :value="h.returnPct" />
                    </td>
                    <td
                      class="text-right font-mono"
                      :class="pnlClass(h.realizedPnl)"
                    >
                      {{ money(h.realizedPnl) }}
                    </td>
                    <td class="text-right font-mono">
                      {{ money(h.earnedDividend) }}
                    </td>
                  </tr>
                  <tr v-if="expanded === h.stockId">
                    <td
                      colspan="9"
                      class="space-y-3 !bg-gray-50 px-3 py-3"
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
          </div>

          <!-- 手機：卡片 -->
          <ul
            v-else
            class="divide-y divide-paper-line"
          >
            <li
              v-for="h in holdings"
              :key="h.stockId"
            >
              <button
                type="button"
                class="w-full px-4 py-3.5 text-left"
                :aria-expanded="expanded === h.stockId"
                @click="toggle(h.stockId)"
              >
                <span class="flex items-baseline justify-between gap-3">
                  <span>
                    <span class="text-base font-bold text-gray-900">{{ h.name }}</span>
                    <span class="ml-1.5 font-mono text-xs text-gray-500">{{ h.stockId }}</span>
                  </span>
                  <span class="font-mono text-base font-semibold text-gray-900">{{ money(h.marketValue) }}</span>
                </span>
                <span class="mt-1 flex items-baseline justify-between gap-3 font-mono text-sm">
                  <span class="text-gray-500">未實現</span>
                  <span :class="pnlClass(h.unrealizedPnl)">
                    {{ money(h.unrealizedPnl) }}
                    <ChangePercent
                      class="ml-1"
                      :value="h.returnPct"
                    />
                  </span>
                </span>
                <span class="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-xs [&>span>span]:block">
                  <span>
                    <span class="text-gray-500">股數</span>
                    <span class="text-gray-800">{{ money(h.shares) }}</span>
                  </span>
                  <span>
                    <span class="text-gray-500">均價</span>
                    <span class="text-gray-800">{{ money(h.avgCost, 2) }}</span>
                  </span>
                  <span>
                    <span class="text-gray-500">現價</span>
                    <span
                      v-if="h.stale"
                      class="text-[#9a6416]"
                    >無股價</span>
                    <span
                      v-else
                      class="text-gray-800"
                    >{{ money(h.price, 2) }}</span>
                  </span>
                  <span>
                    <span class="text-gray-500">已實現</span>
                    <span :class="pnlClass(h.realizedPnl)">{{ money(h.realizedPnl) }}</span>
                  </span>
                  <span>
                    <span class="text-gray-500">已領股利</span>
                    <span class="text-gray-800">{{ money(h.earnedDividend) }}</span>
                  </span>
                  <span>
                    <span class="text-gray-500">占比</span>
                    <span class="text-gray-800">{{ h.weight === null ? '—' : `${h.weight.toFixed(1)}%` }}</span>
                  </span>
                </span>
              </button>
              <div
                v-if="expanded === h.stockId"
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
              </div>
            </li>
          </ul>
        </section>

        <section class="panel">
          <div class="panel-hd">
            <h2 class="panel-title">
              配置比例
            </h2>
            <span class="text-xs text-gray-500">依市值</span>
          </div>
          <div class="p-4">
            <template v-if="allocation.length">
              <PieChart
                :data="allocation"
                :height="220"
              />
              <ul class="mt-3 space-y-1.5 text-sm">
                <li
                  v-for="(a, i) in allocation"
                  :key="a.name"
                  class="flex items-center gap-2"
                >
                  <span
                    class="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                    :style="{ background: PIE_PALETTE[i % PIE_PALETTE.length] }"
                  />
                  <span class="truncate text-gray-800">{{ a.name }}</span>
                  <span class="ml-auto font-mono text-gray-700">{{ a.value.toFixed(1) }}%</span>
                </li>
              </ul>
            </template>
            <p
              v-else
              class="text-sm text-gray-500"
            >
              尚無可計算市值的持股
            </p>
          </div>
        </section>
      </div>
    </template>

    <section
      v-if="closed.length"
      class="panel"
    >
      <div class="panel-hd">
        <h2 class="panel-title">
          已出清
        </h2>
      </div>
      <ul class="divide-y divide-paper-line text-sm">
        <li
          v-for="c in closed"
          :key="c.stockId"
        >
          <button
            type="button"
            class="flex min-h-[48px] w-full flex-wrap items-center justify-between gap-2 px-5 py-2 text-left hover:bg-gray-50"
            :aria-expanded="expanded === c.stockId"
            @click="toggle(c.stockId)"
          >
            <span>
              <span class="font-mono font-semibold text-gray-800">{{ c.stockId }}</span>
              <span class="ml-2 text-gray-700">{{ c.name }}</span>
            </span>
            <span
              class="font-mono"
              :class="pnlClass(c.realizedPnl)"
            >已實現 {{ money(c.realizedPnl) }}<span class="ml-3 text-gray-500">股利 {{ money(c.earnedDividend) }}</span></span>
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

<style scoped>
.summary {
  display: grid;
  gap: 1.25rem;
  padding: 1.5rem;
  border-radius: 16px;
  background: var(--ink);
  color: #fff;
}
@media (min-width: 1024px) {
  .summary { grid-template-columns: 1fr 1.2fr; align-items: center; padding: 1.75rem 2rem; }
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.9rem 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  padding-top: 1rem;
}
@media (min-width: 1024px) {
  .summary-grid { grid-template-columns: repeat(4, 1fr); border-top: 0; border-left: 1px solid rgba(255, 255, 255, 0.15); padding: 0 0 0 2rem; }
}
.summary-grid dt { font-size: 0.78rem; color: rgba(255, 255, 255, 0.7); }
.summary-grid dd { font-family: var(--font-mono); font-size: 1.15rem; font-weight: 500; margin-top: 0.15rem; }
/* 墨綠底上的漲跌色：提亮以維持對比 */
.on-up { color: #ffb4a3; }
.on-dn { color: #9fe0bf; }
</style>
