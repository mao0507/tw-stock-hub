<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { alertsApi } from '@tw-stock-hub/api-client'
import type { AlertItem, AlertType } from '@tw-stock-hub/types'
import {
  AppButton, AppInput, AppSelect, AppModal,
  LoadingSkeleton, EmptyState,
} from '@tw-stock-hub/ui'

const alerts = ref<AlertItem[]>([])
const isLoading = ref(true)

const createOpen = ref(false)
const createLoading = ref(false)
const stockId = ref('')
const alertType = ref<AlertType>('price_above')
const threshold = ref('')

const removeTarget = ref<string | null>(null)
const removeLoading = ref(false)

const typeOptions = [
  { label: '股價高於', value: 'price_above' },
  { label: '股價低於', value: 'price_below' },
  { label: '成交量高於', value: 'volume_above' },
]

const typeLabel: Record<AlertType, string> = {
  price_above: '股價高於',
  price_below: '股價低於',
  volume_above: '成交量高於',
}

const canSubmit = computed(() =>
  stockId.value.trim().length >= 4 && Number(threshold.value) > 0
)

onMounted(load)

async function load(): Promise<void> {
  isLoading.value = true
  try {
    alerts.value = await alertsApi.getAlerts()
  } finally {
    isLoading.value = false
  }
}

function openCreate(): void {
  stockId.value = ''
  alertType.value = 'price_above'
  threshold.value = ''
  createOpen.value = true
}

async function submitCreate(): Promise<void> {
  if (!canSubmit.value) return
  createLoading.value = true
  try {
    await alertsApi.createAlert({
      stockId: stockId.value.trim(),
      alertType: alertType.value,
      threshold: Number(threshold.value),
    })
    createOpen.value = false
    await load()
  } catch {
    alert('新增失敗，請確認輸入內容')
  } finally {
    createLoading.value = false
  }
}

async function confirmRemove(): Promise<void> {
  if (!removeTarget.value) return
  removeLoading.value = true
  try {
    await alertsApi.deleteAlert(removeTarget.value)
    removeTarget.value = null
    await load()
  } finally {
    removeLoading.value = false
  }
}

async function reset(id: string): Promise<void> {
  await alertsApi.resetAlert(id)
  await load()
}
</script>

<template>
  <div class="space-y-6">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">價格警示</h1>
        <div class="page-head-sub">ALERTS</div>
      </div>
      <AppButton size="sm" @click="openCreate">新增警示</AppButton>
    </header>

    <div v-if="isLoading" class="space-y-3">
      <LoadingSkeleton v-for="i in 3" :key="i" type="card" />
    </div>

    <EmptyState
      v-else-if="alerts.length === 0"
      title="還沒有設定任何警示"
      description="新增警示，價格/成交量達標時會自動標記"
      icon="star"
    >
      <template #action>
        <AppButton variant="outline" size="sm" @click="openCreate">新增警示</AppButton>
      </template>
    </EmptyState>

    <div v-else class="space-y-3">
      <div
        v-for="item in alerts"
        :key="item.id"
        class="card flex items-center justify-between p-4"
        :class="item.isTriggered ? 'border-up bg-up-soft/30' : ''"
      >
        <div class="flex items-center gap-3">
          <span class="font-mono text-sm font-bold text-ink">{{ item.stockId }}</span>
          <span class="text-sm text-gray-700">{{ typeLabel[item.alertType] }}</span>
          <span class="font-mono text-sm font-semibold text-gray-900">{{ item.threshold }}</span>
          <span
            v-if="item.isTriggered"
            class="rounded-full bg-up px-2 py-0.5 text-xs font-medium text-white"
          >
            已觸發
          </span>
        </div>
        <div class="flex items-center gap-2">
          <AppButton
            v-if="item.isTriggered"
            variant="ghost"
            size="sm"
            @click="reset(item.id)"
          >
            重新啟用
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            @click="removeTarget = item.id"
          >
            刪除
          </AppButton>
        </div>
      </div>
    </div>

    <AppModal :open="createOpen" title="新增警示" size="sm" @close="createOpen = false">
      <div class="space-y-3">
        <AppInput v-model="stockId" label="股票代號" placeholder="例：2330" />
        <AppSelect v-model="alertType" label="條件" :options="typeOptions" />
        <AppInput v-model="threshold" label="門檻值" placeholder="例：1000" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" @click="createOpen = false">取消</AppButton>
          <AppButton :loading="createLoading" :disabled="!canSubmit" @click="submitCreate">
            新增
          </AppButton>
        </div>
      </template>
    </AppModal>

    <AppModal :open="!!removeTarget" title="確認刪除" size="sm" @close="removeTarget = null">
      <p class="text-sm text-gray-600">確定要刪除此警示嗎？</p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" @click="removeTarget = null">取消</AppButton>
          <AppButton variant="destructive" :loading="removeLoading" @click="confirmRemove">
            確認刪除
          </AppButton>
        </div>
      </template>
    </AppModal>
  </div>
</template>
