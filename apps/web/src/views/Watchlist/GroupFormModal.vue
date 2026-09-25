<script setup lang="ts">
import { ref, watch } from 'vue'
import type { WatchlistGroup } from '@tw-stock-hub/types'
import { AppButton, AppInput, AppModal } from '@tw-stock-hub/ui'

interface Props {
  open: boolean
  /** 有值 = 編輯既有分組 */
  group?: WatchlistGroup | null
  submit: (form: { name: string; color: string | null }) => Promise<void>
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

/** 預設色票（亦是 API 接受的 #RRGGBB 格式） */
const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

const name = ref('')
const color = ref<string | null>(null)
const error = ref('')
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.group?.name ?? ''
    color.value = props.group?.color ?? null
    error.value = ''
  },
  { immediate: true },
)

async function onSubmit(): Promise<void> {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = '請輸入分組名稱'
    return
  }
  if (trimmed.length > 30) {
    error.value = '分組名稱最多 30 字'
    return
  }
  saving.value = true
  try {
    await props.submit({ name: trimmed, color: color.value })
    emit('close')
  } catch {
    error.value = '儲存失敗，請稍後再試'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="group ? '編輯分組' : '新增分組'"
    size="sm"
    @close="emit('close')"
  >
    <form
      class="space-y-4"
      novalidate
      @submit.prevent="onSubmit"
    >
      <AppInput
        v-model="name"
        label="名稱"
        placeholder="例如：高股息、成長股"
        :error="error"
      />
      <fieldset>
        <legend class="mb-2 text-sm font-medium text-gray-700">
          顏色
        </legend>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-xs text-gray-400"
            :class="color === null ? 'ring-2 ring-up ring-offset-1' : ''"
            aria-label="不設定顏色"
            @click="color = null"
          >
            ✕
          </button>
          <button
            v-for="c in PALETTE"
            :key="c"
            type="button"
            class="h-7 w-7 rounded-full"
            :class="color === c ? 'ring-2 ring-gray-800 ring-offset-1' : ''"
            :style="{ backgroundColor: c }"
            :aria-label="`顏色 ${c}`"
            :aria-pressed="color === c"
            @click="color = c"
          />
        </div>
      </fieldset>
      <div class="flex justify-end gap-2">
        <AppButton
          type="button"
          variant="ghost"
          @click="emit('close')"
        >
          取消
        </AppButton>
        <AppButton
          type="submit"
          :loading="saving"
        >
          儲存
        </AppButton>
      </div>
    </form>
  </AppModal>
</template>
