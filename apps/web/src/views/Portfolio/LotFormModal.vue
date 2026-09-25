<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CreateLotForm, HoldingLot } from '@tw-stock-hub/types'
import { AppButton, AppDatePicker, AppInput, AppModal } from '@tw-stock-hub/ui'
import { suggestBuyFee } from './fee'

interface Props {
  open: boolean
  /** 有值 = 編輯既有批次（股票代號不可改） */
  lot?: HoldingLot | null
  /** 新增時預填的股票代號 */
  defaultStockId?: string
  /** 新增時預填的成交價（例如個股頁的最新收盤價） */
  defaultPrice?: number | null
  submit: (form: CreateLotForm) => Promise<void>
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())

const form = reactive({ stockId: '', boughtAt: '', price: '', shares: '', fee: '' })
const feeTouched = ref(false)
const errors = ref<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

const isEdit = computed(() => !!props.lot)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const l = props.lot
    form.stockId = l?.stockId ?? props.defaultStockId ?? ''
    form.boughtAt = l?.boughtAt ?? today()
    form.price = l ? String(l.price) : props.defaultPrice != null ? String(props.defaultPrice) : ''
    form.shares = l ? String(l.shares) : ''
    form.fee = l ? String(l.fee) : ''
    feeTouched.value = isEdit.value
    errors.value = {}
    serverError.value = ''
  },
  { immediate: true },
)

// 使用者未手動改過手續費前，依價格與股數自動試算
watch([() => form.price, () => form.shares], () => {
  if (feeTouched.value) return
  form.fee = String(suggestBuyFee(Number(form.price), Number(form.shares)))
})

function onFeeInput(v: string): void {
  feeTouched.value = true
  form.fee = v
}

function validate(): CreateLotForm | null {
  const e: Record<string, string> = {}
  const stockId = form.stockId.trim().toUpperCase()
  const price = Number(form.price)
  const shares = Number(form.shares)
  const fee = form.fee === '' ? 0 : Number(form.fee)

  if (!/^[0-9A-Z]{4,6}$/.test(stockId)) e['stockId'] = '請輸入股票代號'
  if (!form.boughtAt) e['boughtAt'] = '請選擇日期'
  else if (form.boughtAt > today()) e['boughtAt'] = '日期不可晚於今天'
  if (form.price === '' || !(price >= 0)) e['price'] = '請輸入成交價（配股請填 0）'
  if (!Number.isInteger(shares) || shares <= 0) e['shares'] = '股數須為正整數（可為零股）'
  if (!(fee >= 0)) e['fee'] = '手續費不可為負'

  errors.value = e
  return Object.keys(e).length ? null : { stockId, boughtAt: form.boughtAt, price, shares, fee }
}

async function onSubmit(): Promise<void> {
  const payload = validate()
  if (!payload) return
  saving.value = true
  serverError.value = ''
  try {
    await props.submit(payload)
    emit('close')
  } catch (err) {
    const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data
    serverError.value = typeof data?.error === 'string' ? data.error : '儲存失敗，請確認欄位後再試'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="isEdit ? `編輯買入批次（${lot?.stockId}）` : defaultStockId ? `記錄買入（${defaultStockId}）` : '記錄買入'"
    @close="emit('close')"
  >
    <form
      class="space-y-3"
      novalidate
      @submit.prevent="onSubmit"
    >
      <div
        v-if="serverError"
        role="alert"
        class="rounded-lg bg-red-50 p-3 text-sm text-red-600"
      >
        {{ serverError }}
      </div>

      <AppInput
        v-if="!isEdit && !defaultStockId"
        v-model="form.stockId"
        label="股票代號"
        placeholder="例如 2330"
        :error="errors['stockId']"
      />

      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">買入日期</span>
        <AppDatePicker v-model="form.boughtAt" />
        <p
          v-if="errors['boughtAt']"
          class="mt-1 text-xs text-red-500"
        >
          {{ errors['boughtAt'] }}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <AppInput
          v-model="form.price"
          label="成交價"
          type="number"
          placeholder="0.00"
          :error="errors['price']"
        />
        <AppInput
          v-model="form.shares"
          label="股數"
          type="number"
          placeholder="1000"
          :error="errors['shares']"
        />
      </div>

      <AppInput
        :model-value="form.fee"
        label="手續費（預設依 0.1425% 試算，可改為實際折扣後金額）"
        type="number"
        :error="errors['fee']"
        @update:model-value="onFeeInput"
      />

      <div class="flex justify-end gap-2 pt-2">
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
