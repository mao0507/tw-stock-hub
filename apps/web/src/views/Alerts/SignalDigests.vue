<script setup lang="ts">
// 範圍訊號訂閱（#34）：全部自選股或某分組出現指定訊號時，每天彙整成一則通知
import { computed, onMounted, ref } from 'vue'
import { alertsApi, watchlistApi } from '@tw-stock-hub/api-client'
import { SIGNAL_META, signalLabel, type SignalCode, type SignalDigest, type WatchlistGroup } from '@tw-stock-hub/types'
import { AppButton, AppSelect } from '@tw-stock-hub/ui'

const ALL = '__all__'
const digests = ref<SignalDigest[] | null>(null)
const groups = ref<WatchlistGroup[]>([])
const loadError = ref('')
const scope = ref(ALL)
const picked = ref<SignalCode[]>([])
const saving = ref(false)
const formError = ref('')

const SIGNAL_OPTIONS = (Object.keys(SIGNAL_META) as SignalCode[]).map((code) => ({ code, ...SIGNAL_META[code] }))
const scopeOptions = computed(() => [
  { value: ALL, label: '全部自選股' },
  ...groups.value.map((g) => ({ value: g.id, label: `分組：${g.name}` })),
])

async function load(): Promise<void> {
  loadError.value = ''
  try {
    const [d, w] = await Promise.all([alertsApi.getSignalDigests(), watchlistApi.getWatchlist()])
    digests.value = d
    groups.value = w.groups
  } catch (e) {
    console.warn('[SignalDigests] load failed', e)
    loadError.value = '範圍訂閱載入失敗，請稍後再試'
  }
}
onMounted(load)

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback

async function submit(): Promise<void> {
  if (!picked.value.length) return
  saving.value = true
  formError.value = ''
  try {
    await alertsApi.createSignalDigest({ groupId: scope.value === ALL ? null : scope.value, signals: picked.value })
    picked.value = []
    await load()
  } catch (e) {
    formError.value = errMsg(e, '建立失敗，請稍後再試')
  } finally {
    saving.value = false
  }
}

async function toggle(d: SignalDigest): Promise<void> {
  try {
    await alertsApi.setSignalDigestActive(d.id, !d.isActive)
    await load()
  } catch (e) {
    loadError.value = errMsg(e, '更新失敗，請稍後再試')
  }
}

async function remove(d: SignalDigest): Promise<void> {
  try {
    await alertsApi.deleteSignalDigest(d.id)
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
        自選股訊號彙整
      </h2>
      <span class="panel-tag">每日一則</span>
    </div>
    <form
      class="space-y-3 border-b border-paper-line p-4"
      @submit.prevent="submit"
    >
      <div class="w-full sm:w-64">
        <AppSelect
          v-model="scope"
          label="範圍"
          :options="scopeOptions"
        />
      </div>
      <fieldset>
        <legend class="mb-1.5 text-sm text-gray-700">
          訊號（可多選）
        </legend>
        <div class="flex flex-wrap gap-1.5">
          <label
            v-for="s in SIGNAL_OPTIONS"
            :key="s.code"
            :class="['pill inline-flex cursor-pointer items-center gap-1.5', picked.includes(s.code) && 'pill-on']"
          >
            <input
              v-model="picked"
              type="checkbox"
              :value="s.code"
              class="sr-only"
            >
            <span :class="s.side === 'bull' ? 'is-up' : 'is-dn'">{{ s.side === 'bull' ? '▲' : '▼' }}</span>
            {{ s.label }}
          </label>
        </div>
      </fieldset>
      <div class="flex items-center gap-3">
        <AppButton
          type="submit"
          :loading="saving"
          :disabled="!picked.length"
        >
          建立彙整
        </AppButton>
        <p
          v-if="formError"
          role="alert"
          class="text-sm text-red-700"
        >
          {{ formError }}
        </p>
      </div>
    </form>

    <p
      v-if="loadError"
      role="alert"
      class="p-4 text-sm text-red-700"
    >
      {{ loadError }}
    </p>
    <p
      v-else-if="digests && !digests.length"
      class="p-5 text-sm text-gray-500"
    >
      還沒有範圍訂閱。例如：「存股」分組出現 KD 低檔黃金交叉或突破 60 日新高時，每天彙整通知一次。
    </p>
    <ul
      v-else-if="digests"
      class="divide-y divide-paper-line"
    >
      <li
        v-for="d in digests"
        :key="d.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        :class="!d.isActive && 'opacity-60'"
      >
        <div class="min-w-0 flex-1">
          <div class="font-bold text-gray-900">
            {{ d.groupName ? `分組：${d.groupName}` : '全部自選股' }}
          </div>
          <div class="mt-0.5 text-sm text-gray-700">
            {{ d.signals.map(signalLabel).join('、') }}
            <span
              v-if="d.lastNotifiedDate"
              class="ml-2 text-xs text-gray-500"
            >上次通知 {{ d.lastNotifiedDate }}</span>
          </div>
        </div>
        <div class="ml-auto flex gap-2">
          <AppButton
            variant="outline"
            size="sm"
            @click="toggle(d)"
          >
            {{ d.isActive ? '停用' : '啟用' }}
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            class="text-red-600"
            @click="remove(d)"
          >
            刪除
          </AppButton>
        </div>
      </li>
    </ul>
    <p class="border-t border-paper-line px-5 py-2.5 text-xs text-gray-500">
      只含當下仍在範圍內的股票；刪除分組會一併移除該分組的訂閱。
    </p>
  </section>
</template>
