<script setup lang="ts">
// 指標參數設定面板（#36，桌機）：存在帳號、跨裝置同步；手機只套用、不提供編輯
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { INDICATOR_PARAM_SPECS, withIndicatorDefaults, type IndicatorKey } from '@tw-stock-hub/charts'
import { AppButton } from '@tw-stock-hub/ui'
import { useAuthStore } from '@/stores/auth.store'
import { useChartPrefs } from '@/composables/useChartPrefs'

const { isLoggedIn } = storeToRefs(useAuthStore())
const { params, save, reset } = useChartPrefs()

const open = ref(false)
const draft = ref<Record<string, Record<string, number>>>({})
const saving = ref(false)
const message = ref('')

const load = () => {
  draft.value = JSON.parse(JSON.stringify(withIndicatorDefaults(params.value))) as Record<string, Record<string, number>>
}
watch(params, load, { immediate: true })

function invalid(): string | null {
  for (const ind of INDICATOR_PARAM_SPECS) {
    for (const p of ind.params) {
      const v = draft.value[ind.key]?.[p.key]
      const needsInt = !p.step
      if (typeof v !== 'number' || Number.isNaN(v) || v < p.min || v > p.max || (needsInt && !Number.isInteger(v))) {
        return `${ind.label} ${p.label}須為 ${p.min}–${p.max}${needsInt ? ' 的整數' : ''}`
      }
    }
  }
  const m = draft.value['macd']!
  return m['fast']! < m['slow']! ? null : 'MACD 快線需小於慢線'
}

async function onSave(): Promise<void> {
  const err = invalid()
  if (err) { message.value = err; return }
  saving.value = true
  message.value = ''
  try {
    await save(draft.value as Parameters<typeof save>[0])
    message.value = '已儲存，所有裝置同步套用'
  } catch (e) {
    console.warn('[ChartSettings] save failed', e)
    message.value = '儲存失敗，請稍後再試'
  } finally {
    saving.value = false
  }
}

async function onReset(): Promise<void> {
  saving.value = true
  try {
    await reset()
    load()
    message.value = '已還原預設'
  } catch (e) {
    console.warn('[ChartSettings] reset failed', e)
    message.value = '還原失敗，請稍後再試'
  } finally {
    saving.value = false
  }
}

const setValue = (ind: IndicatorKey, key: string, v: string) => {
  draft.value = { ...draft.value, [ind]: { ...draft.value[ind], [key]: v === '' ? Number.NaN : Number(v) } }
}
</script>

<template>
  <section class="panel hidden md:block">
    <button
      type="button"
      class="flex w-full items-center justify-between px-5 py-3 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="panel-title">指標參數</span>
      <span class="text-xs text-gray-500">{{ open ? '收合' : '展開設定' }}</span>
    </button>
    <div
      v-if="open"
      class="border-t border-paper-line p-5"
    >
      <p
        v-if="!isLoggedIn"
        class="text-sm text-gray-500"
      >
        登入後可自訂指標參數，並在所有裝置同步。
      </p>
      <template v-else>
        <div class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <fieldset
            v-for="ind in INDICATOR_PARAM_SPECS"
            :key="ind.key"
          >
            <legend class="mb-1.5 text-sm font-semibold text-gray-900">
              {{ ind.label }}
            </legend>
            <label
              v-for="p in ind.params"
              :key="p.key"
              class="mb-1.5 flex items-center justify-between gap-2 text-xs text-gray-600"
            >
              {{ p.label }}
              <input
                type="number"
                class="w-20 rounded-lg border border-paper-line bg-white px-2 py-1.5 text-right font-mono text-sm text-gray-900"
                :min="p.min"
                :max="p.max"
                :step="p.step ?? 1"
                :value="draft[ind.key]?.[p.key]"
                @input="setValue(ind.key, p.key, ($event.target as HTMLInputElement).value)"
              >
            </label>
          </fieldset>
        </div>
        <div class="mt-4 flex items-center gap-3">
          <AppButton
            size="sm"
            :loading="saving"
            @click="onSave"
          >
            儲存
          </AppButton>
          <AppButton
            size="sm"
            variant="outline"
            :disabled="saving"
            @click="onReset"
          >
            還原預設
          </AppButton>
          <span
            v-if="message"
            role="status"
            class="text-sm text-gray-600"
          >{{ message }}</span>
        </div>
      </template>
    </div>
  </section>
</template>
