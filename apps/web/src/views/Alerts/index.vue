<script setup lang="ts">
// 盤後提醒（#26）：每天行情更新後評估，成立時發站內通知（有綁定 Telegram 也會同步推送）
import { ref, onMounted, computed } from 'vue'
import { alertsApi } from '@tw-stock-hub/api-client'
import type { AlertItem, AlertType } from '@tw-stock-hub/types'
import {
  AppButton, AppInput, AppSelect, AppModal,
  LoadingSkeleton, EmptyState,
} from '@tw-stock-hub/ui'
import TelegramLink from './TelegramLink.vue'

const alerts = ref<AlertItem[]>([])
const isLoading = ref(true)
const loadError = ref('')

const createOpen = ref(false)
const createLoading = ref(false)
const createError = ref('')
const stockId = ref('')
const alertType = ref<AlertType>('price_above')
const threshold = ref('')

const removeTarget = ref<AlertItem | null>(null)
const removeLoading = ref(false)

const TYPES: Record<AlertType, { label: string; unit: string; example: string }> = {
  price_above: { label: '收盤價高於', unit: '元', example: '1000' },
  price_below: { label: '收盤價低於', unit: '元', example: '900' },
  change_above: { label: '漲幅達', unit: '%', example: '5' },
  change_below: { label: '跌幅達', unit: '%', example: '5' },
  volume_above: { label: '成交量達', unit: '張', example: '50000' },
}
const typeOptions = (Object.keys(TYPES) as AlertType[]).map((k) => ({ label: TYPES[k].label, value: k }))

const canSubmit = computed(() => /^[0-9A-Za-z]{4,6}$/.test(stockId.value.trim()) && Number(threshold.value) > 0)

onMounted(load)

async function load(): Promise<void> {
  isLoading.value = true
  loadError.value = ''
  try {
    alerts.value = await alertsApi.getAlerts()
  } catch (e) {
    console.warn('[Alerts] load failed', e)
    loadError.value = '提醒載入失敗，請稍後再試'
  } finally {
    isLoading.value = false
  }
}

function openCreate(): void {
  stockId.value = ''
  alertType.value = 'price_above'
  threshold.value = ''
  createError.value = ''
  createOpen.value = true
}

async function submitCreate(): Promise<void> {
  if (!canSubmit.value) return
  createLoading.value = true
  createError.value = ''
  try {
    await alertsApi.createAlert({
      stockId: stockId.value.trim().toUpperCase(),
      alertType: alertType.value,
      threshold: Number(threshold.value),
    })
    createOpen.value = false
    await load()
  } catch (e) {
    const status = (e as { response?: { status?: number; data?: { error?: string } } }).response
    createError.value = status?.data?.error ?? '新增失敗，請確認股票代號與門檻'
  } finally {
    createLoading.value = false
  }
}

async function confirmRemove(): Promise<void> {
  if (!removeTarget.value) return
  removeLoading.value = true
  try {
    await alertsApi.deleteAlert(removeTarget.value.id)
    removeTarget.value = null
    await load()
  } catch (e) {
    console.warn('[Alerts] delete failed', e)
    loadError.value = '刪除失敗，請稍後再試'
    removeTarget.value = null
  } finally {
    removeLoading.value = false
  }
}

async function reset(id: string): Promise<void> {
  try {
    await alertsApi.resetAlert(id)
    await load()
  } catch (e) {
    console.warn('[Alerts] reset failed', e)
    loadError.value = '重新啟用失敗，請稍後再試'
  }
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">
          盤後提醒
        </h1>
        <div class="page-head-sub">
          ALERTS
        </div>
      </div>
      <AppButton @click="openCreate">
        新增提醒
      </AppButton>
    </header>

    <p class="text-sm text-gray-600">
      每個交易日收盤資料更新後自動檢查，條件成立時會出現在右上角通知；觸發後需「重新啟用」才會再次提醒。
    </p>

    <TelegramLink />

    <LoadingSkeleton
      v-if="isLoading"
      :rows="3"
    />
    <p
      v-else-if="loadError"
      role="alert"
      class="rounded-xl bg-red-50 p-3 text-sm text-red-700"
    >
      {{ loadError }}
    </p>
    <EmptyState
      v-else-if="alerts.length === 0"
      title="還沒有設定提醒"
      description="例如：台積電收盤高於 1000 元、跌幅達 5% 時通知我"
      icon="star"
    />

    <ul
      v-else
      class="panel divide-y divide-paper-line"
    >
      <li
        v-for="item in alerts"
        :key="item.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
      >
        <div class="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <router-link
              :to="{ name: 'stock-detail', params: { id: item.stockId } }"
              class="font-bold text-gray-900 hover:text-ink"
            >
              {{ item.stockName }}
            </router-link>
            <span class="font-mono text-xs text-gray-500">{{ item.stockId }}</span>
          </div>
          <div class="mt-0.5 text-sm text-gray-700">
            {{ TYPES[item.alertType].label }}
            <span class="font-mono font-semibold text-gray-900">{{ item.threshold.toLocaleString() }}</span>
            {{ TYPES[item.alertType].unit }}
          </div>
        </div>
        <span
          v-if="item.isTriggered"
          class="badge bg-[#b7791f]/10 text-[#9a6416]"
        >已觸發 {{ item.triggeredAt ? fmtTime(item.triggeredAt) : '' }}</span>
        <span
          v-else
          class="badge bg-ink-soft text-ink"
        >監控中</span>
        <div class="ml-auto flex gap-2">
          <AppButton
            v-if="item.isTriggered"
            variant="outline"
            size="sm"
            @click="reset(item.id)"
          >
            重新啟用
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            class="text-red-600"
            @click="removeTarget = item"
          >
            刪除
          </AppButton>
        </div>
      </li>
    </ul>

    <AppModal
      :open="createOpen"
      title="新增提醒"
      size="sm"
      @close="createOpen = false"
    >
      <form
        class="space-y-3"
        @submit.prevent="submitCreate"
      >
        <AppInput
          v-model="stockId"
          label="股票代號"
          placeholder="例：2330"
        />
        <AppSelect
          v-model="alertType"
          label="條件"
          :options="typeOptions"
        />
        <AppInput
          v-model="threshold"
          :label="`門檻（${TYPES[alertType].unit}）`"
          type="number"
          :placeholder="`例：${TYPES[alertType].example}`"
        />
        <p
          v-if="createError"
          role="alert"
          class="text-sm text-red-700"
        >
          {{ createError }}
        </p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="createOpen = false"
          >
            取消
          </AppButton>
          <AppButton
            :loading="createLoading"
            :disabled="!canSubmit"
            @click="submitCreate"
          >
            新增
          </AppButton>
        </div>
      </template>
    </AppModal>

    <AppModal
      :open="!!removeTarget"
      title="刪除提醒"
      size="sm"
      @close="removeTarget = null"
    >
      <p class="text-sm text-gray-700">
        確定刪除「{{ removeTarget?.stockName }} {{ removeTarget ? TYPES[removeTarget.alertType].label : '' }} {{ removeTarget?.threshold }}」？
      </p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton
            variant="ghost"
            @click="removeTarget = null"
          >
            取消
          </AppButton>
          <AppButton
            variant="destructive"
            :loading="removeLoading"
            @click="confirmRemove"
          >
            刪除
          </AppButton>
        </div>
      </template>
    </AppModal>
  </div>
</template>
