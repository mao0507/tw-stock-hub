<script setup lang="ts">
// 逐檔訊號訂閱（#33）：該股出現指定訊號的交易日通知一次，訂閱持續有效
import { computed, onMounted, ref } from 'vue'
import { alertsApi } from '@tw-stock-hub/api-client'
import { SIGNAL_META, signalLabel, type SignalCode, type SignalSubscription } from '@tw-stock-hub/types'
import { AppButton, AppInput, AppSelect } from '@tw-stock-hub/ui'

const subs = ref<SignalSubscription[] | null>(null)
const loadError = ref('')
const stockId = ref('')
const signal = ref<SignalCode>('kd_low_golden_cross')
const saving = ref(false)
const formError = ref('')

const signalOptions = (Object.keys(SIGNAL_META) as SignalCode[]).map((code) => ({
  value: code,
  label: `${SIGNAL_META[code].side === 'bull' ? '▲' : '▼'} ${SIGNAL_META[code].label}`,
}))
const canSubmit = computed(() => /^[0-9A-Za-z]{4,6}$/.test(stockId.value.trim()))

async function load(): Promise<void> {
  loadError.value = ''
  try {
    subs.value = await alertsApi.getSignalSubscriptions()
  } catch (e) {
    console.warn('[SignalSubscriptions] load failed', e)
    loadError.value = '訊號訂閱載入失敗，請稍後再試'
  }
}
onMounted(load)

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  saving.value = true
  formError.value = ''
  try {
    await alertsApi.createSignalSubscription({ stockId: stockId.value.trim().toUpperCase(), signal: signal.value })
    stockId.value = ''
    await load()
  } catch (e) {
    formError.value = errMsg(e, '訂閱失敗，請確認股票代號')
  } finally {
    saving.value = false
  }
}

async function toggle(s: SignalSubscription): Promise<void> {
  try {
    await alertsApi.setSignalSubscriptionActive(s.id, !s.isActive)
    await load()
  } catch (e) {
    loadError.value = errMsg(e, '更新失敗，請稍後再試')
  }
}

async function remove(s: SignalSubscription): Promise<void> {
  try {
    await alertsApi.deleteSignalSubscription(s.id)
    await load()
  } catch (e) {
    loadError.value = errMsg(e, '刪除失敗，請稍後再試')
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-hd">
      <h2 class="panel-title">
        訊號訂閱
      </h2>
      <span class="panel-tag">盤後</span>
    </div>
    <form
      class="flex flex-wrap items-end gap-3 border-b border-paper-line p-4"
      @submit.prevent="submit"
    >
      <div class="w-32">
        <AppInput
          v-model="stockId"
          label="股票代號"
          placeholder="例：2330"
        />
      </div>
      <div class="min-w-[220px] flex-1 sm:max-w-xs">
        <AppSelect
          v-model="signal"
          label="訊號"
          :options="signalOptions"
        />
      </div>
      <AppButton
        type="submit"
        :loading="saving"
        :disabled="!canSubmit"
      >
        訂閱
      </AppButton>
      <p
        v-if="formError"
        role="alert"
        class="basis-full text-sm text-red-700"
      >
        {{ formError }}
      </p>
    </form>

    <p
      v-if="loadError"
      role="alert"
      class="p-4 text-sm text-red-700"
    >
      {{ loadError }}
    </p>
    <p
      v-else-if="subs && !subs.length"
      class="p-5 text-sm text-gray-500"
    >
      還沒有訊號訂閱。例如：台積電出現「KD 低檔黃金交叉」時通知我。
    </p>
    <ul
      v-else-if="subs"
      class="divide-y divide-paper-line"
    >
      <li
        v-for="s in subs"
        :key="s.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        :class="!s.isActive && 'opacity-60'"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <router-link
              :to="{ name: 'stock-detail', params: { id: s.stockId } }"
              class="font-bold text-gray-900 hover:text-ink"
            >
              {{ s.stockName }}
            </router-link>
            <span class="font-mono text-xs text-gray-500">{{ s.stockId }}</span>
          </div>
          <div class="mt-0.5 text-sm text-gray-700">
            <span :class="SIGNAL_META[s.signal as SignalCode]?.side === 'bear' ? 'is-dn' : 'is-up'">
              {{ SIGNAL_META[s.signal as SignalCode]?.side === 'bear' ? '▼' : '▲' }}
            </span>
            {{ signalLabel(s.signal) }}
            <span
              v-if="s.lastNotifiedDate"
              class="ml-2 text-xs text-gray-500"
            >上次通知 {{ s.lastNotifiedDate }}</span>
          </div>
        </div>
        <div class="ml-auto flex gap-2">
          <AppButton
            variant="outline"
            size="sm"
            @click="toggle(s)"
          >
            {{ s.isActive ? '停用' : '啟用' }}
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            class="text-red-600"
            @click="remove(s)"
          >
            刪除
          </AppButton>
        </div>
      </li>
    </ul>
    <p class="border-t border-paper-line px-5 py-2.5 text-xs text-gray-500">
      每個交易日盤後偵測訊號後檢查，同一檔同一訊號一天只通知一次；訊號僅供參考，非買賣建議。
    </p>
  </section>
</template>
