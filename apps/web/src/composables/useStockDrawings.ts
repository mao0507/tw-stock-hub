// 個股 K 線畫線（#37）：登入才載入與編輯；水平線可轉成到價提醒（重用提醒 API）
import { ref, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { alertsApi, drawingsApi } from '@tw-stock-hub/api-client'
import type { ChartDrawingDto, DrawingPointDto } from '@tw-stock-hub/types'
import { useAuthStore } from '@/stores/auth.store'

export function useStockDrawings(stockId: Ref<string>, lastClose: Ref<number | null | undefined>) {
  const { isLoggedIn } = storeToRefs(useAuthStore())
  const drawings = ref<ChartDrawingDto[]>([])
  const message = ref('')

  async function load(): Promise<void> {
    const id = stockId.value
    if (!isLoggedIn.value || !id) { drawings.value = []; return }
    try {
      const list = await drawingsApi.list(id)
      if (id === stockId.value) drawings.value = list
    } catch (e) {
      console.warn('[drawings] load failed', e)
    }
  }
  watch([stockId, isLoggedIn], load, { immediate: true })

  const fail = (what: string) => (e: unknown) => {
    message.value = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? `${what}失敗，請稍後再試`
    void load() // 回復成伺服器上的狀態
  }

  async function create(d: { kind: ChartDrawingDto['kind']; points: DrawingPointDto[] }): Promise<void> {
    message.value = ''
    await drawingsApi.create({ stockId: stockId.value, ...d })
      .then((r) => { drawings.value = [...drawings.value, r] }, fail('新增畫線'))
  }

  async function update(id: string, points: DrawingPointDto[]): Promise<void> {
    await drawingsApi.update(id, points)
      .then((r) => { drawings.value = drawings.value.map((d) => (d.id === id ? r : d)) }, fail('更新畫線'))
  }

  async function remove(id: string): Promise<void> {
    await drawingsApi.remove(id)
      .then(() => { drawings.value = drawings.value.filter((d) => d.id !== id) }, fail('刪除畫線'))
  }

  /** 目前收盤在線上 → 跌破（低於）時提醒；在線下 → 突破（高於）時提醒 */
  async function toAlert(d: { points: DrawingPointDto[] }): Promise<void> {
    const price = d.points[0]!.price
    const close = lastClose.value
    const alertType = close != null && close >= price ? 'price_below' : 'price_above'
    try {
      await alertsApi.createAlert({ stockId: stockId.value, alertType, threshold: price })
      message.value = `已建立提醒：收盤${alertType === 'price_above' ? '高於' : '低於'} ${price}`
    } catch (e) {
      message.value = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '建立提醒失敗，請稍後再試'
    }
  }

  return { drawings, message, create, update, remove, toAlert }
}
