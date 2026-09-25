<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CreateSellForm, SellTransaction } from '@tw-stock-hub/types'
import { AppButton, AppDatePicker, AppInput, AppModal } from '@tw-stock-hub/ui'
import { suggestSellCosts } from './fee'

interface Props {
  open: boolean
  /** 賣出哪一檔（新增時必填；編輯時取自 sell） */
  stockId: string
  /** 有值 = 編輯既有賣出 */
  sell?: SellTransaction | null
  /** 目前持有股數，只作提示；超賣以後端 409 為準（補登過去日期時可賣股數不同） */
  heldShares?: number
  submit: (form: CreateSellForm) => Promise<void>
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())

const form = reactive({ soldAt: '', price: '', shares: '', fee: '', tax: '' })
const costsTouched = ref(false)
const errors = ref<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

const isEdit = computed(() => !!props.sell)
const targetStock = computed(() => props.sell?.stockId ?? props.stockId)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const s = props.sell
    form.soldAt = s?.soldAt ?? today()
    form.price = s ? String(s.price) : ''
    form.shares = s ? String(s.shares) : ''
    form.fee = s ? String(s.fee) : ''
    form.tax = s ? String(s.tax) : ''
    costsTouched.value = isEdit.value
    errors.value = {}
    serverError.value = ''
  },
  { immediate: true },
)

// 未手動改過前，依價格與股數自動試算手續費與證交稅
watch([() => form.price, () => form.shares], () => {
  if (costsTouched.value) return
  const { fee, tax } = suggestSellCosts(targetStock.value, Number(form.price), Number(form.shares))
  form.fee = String(fee)
  form.tax = String(tax)
})

function onCostInput(field: 'fee' | 'tax', v: string): void {
  costsTouched.value = true
  form[field] = v
}

function validate(): CreateSellForm | null {
  const e: Record<string, string> = {}
  const price = Number(form.price)
  const shares = Number(form.shares)
  const fee = form.fee === '' ? 0 : Number(form.fee)
  const tax = form.tax === '' ? 0 : Number(form.tax)

  if (!form.soldAt) e['soldAt'] = '請選擇日期'
  else if (form.soldAt > today()) e['soldAt'] = '日期不可晚於今天'
  if (!(price > 0)) e['price'] = '價格須大於 0'
  if (!Number.isInteger(shares) || shares <= 0) e['shares'] = '股數須為正整數（可為零股）'
  if (!(fee >= 0)) e['fee'] = '手續費不可為負'
  if (!(tax >= 0)) e['tax'] = '證交稅不可為負'

  errors.value = e
  return Object.keys(e).length ? null : { stockId: targetStock.value, soldAt: form.soldAt, price, shares, fee, tax }
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
    :title="isEdit ? `編輯賣出（${targetStock}）` : `記錄賣出（${targetStock}）`"
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

      <p
        v-if="heldShares !== undefined && !isEdit"
        class="text-xs text-gray-500"
      >
        目前持有 {{ heldShares.toLocaleString('zh-TW') }} 股
      </p>

      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">賣出日期</span>
        <AppDatePicker v-model="form.soldAt" />
        <p
          v-if="errors['soldAt']"
          class="mt-1 text-xs text-red-500"
        >
          {{ errors['soldAt'] }}
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

      <div class="grid grid-cols-2 gap-3">
        <AppInput
          :model-value="form.fee"
          label="手續費"
          type="number"
          :error="errors['fee']"
          @update:model-value="(v) => onCostInput('fee', v)"
        />
        <AppInput
          :model-value="form.tax"
          label="證交稅"
          type="number"
          :error="errors['tax']"
          @update:model-value="(v) => onCostInput('tax', v)"
        />
      </div>
      <p class="text-xs text-gray-400">
        預設依手續費 0.1425%、證交稅 0.3%（ETF 0.1%）試算，可改為實際金額。
      </p>

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
