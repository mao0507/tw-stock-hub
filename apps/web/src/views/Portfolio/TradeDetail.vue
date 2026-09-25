<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { portfolioApi } from '@tw-stock-hub/api-client'
import type { HoldingLot, SellTransaction } from '@tw-stock-hub/types'
import { AppButton } from '@tw-stock-hub/ui'
import { money, pnlClass } from './format'

// 單一股票的交易明細（買入批次 + 賣出紀錄）。持股列與已出清列共用。
interface Props {
  stockId: string
  /** 父層在任何異動後遞增，觸發重新載入 */
  reloadToken: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  editLot: [lot: HoldingLot]
  deleteLot: [lot: HoldingLot]
  editSell: [sell: SellTransaction]
  deleteSell: [sell: SellTransaction]
}>()

const lots = ref<HoldingLot[]>([])
const sells = ref<SellTransaction[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

let requestId = 0
let unmounted = false
onBeforeUnmount(() => { unmounted = true })

async function load(): Promise<void> {
  const id = ++requestId
  loading.value = true
  loadError.value = null
  try {
    const [l, s] = await Promise.all([portfolioApi.listLots(props.stockId), portfolioApi.listSells(props.stockId)])
    // 只採用最新一次請求的結果，避免舊回應覆蓋
    if (unmounted || id !== requestId) return
    lots.value = l
    sells.value = s
  } catch (e) {
    if (unmounted || id !== requestId) return
    console.warn('[TradeDetail] load failed', e)
    loadError.value = '交易明細載入失敗，請重新展開'
  } finally {
    if (!unmounted && id === requestId) loading.value = false
  }
}

watch(() => [props.stockId, props.reloadToken], () => { void load() }, { immediate: true })
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="loading && !lots.length && !sells.length"
      class="text-xs text-gray-400"
    >
      載入交易明細中…
    </p>
    <p
      v-else-if="loadError"
      role="alert"
      class="text-xs text-red-500"
    >
      {{ loadError }}
    </p>
    <template v-else>
      <table
        v-if="lots.length"
        class="w-full text-xs"
      >
        <caption class="pb-1 text-left font-semibold text-gray-500">
          買入批次
        </caption>
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
                @click.stop="emit('editLot', lot)"
              >
                編輯
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                class="text-red-500"
                @click.stop="emit('deleteLot', lot)"
              >
                刪除
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        v-if="sells.length"
        class="w-full text-xs"
      >
        <caption class="pb-1 text-left font-semibold text-gray-500">
          賣出紀錄
        </caption>
        <thead class="text-left text-gray-400">
          <tr>
            <th class="py-1 pr-3">
              賣出日
            </th>
            <th class="py-1 pr-3 text-right">
              成交價
            </th>
            <th class="py-1 pr-3 text-right">
              股數
            </th>
            <th class="py-1 pr-3 text-right">
              手續費＋稅
            </th>
            <th class="py-1 pr-3 text-right">
              當時均價
            </th>
            <th class="py-1 pr-3 text-right">
              已實現損益
            </th>
            <th class="py-1" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="sell in sells"
            :key="sell.id"
            class="border-t border-gray-200"
          >
            <td class="py-1.5 pr-3 font-mono">
              {{ sell.soldAt }}
            </td>
            <td class="py-1.5 pr-3 text-right font-mono">
              {{ money(sell.price, 2) }}
            </td>
            <td class="py-1.5 pr-3 text-right font-mono">
              {{ money(sell.shares) }}
            </td>
            <td class="py-1.5 pr-3 text-right font-mono">
              {{ money(sell.fee + sell.tax) }}
            </td>
            <td class="py-1.5 pr-3 text-right font-mono">
              {{ money(sell.avgCostAtSale, 2) }}
            </td>
            <td
              class="py-1.5 pr-3 text-right font-mono"
              :class="pnlClass(sell.realizedPnl)"
            >
              {{ money(sell.realizedPnl) }}
            </td>
            <td class="py-1.5 text-right">
              <AppButton
                size="sm"
                variant="ghost"
                @click.stop="emit('editSell', sell)"
              >
                編輯
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                class="text-red-500"
                @click.stop="emit('deleteSell', sell)"
              >
                刪除
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
