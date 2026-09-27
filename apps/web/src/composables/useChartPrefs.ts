// 圖表指標參數偏好（#36）：登入時從帳號載入、全站共用一份；未登入用預設值
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { prefsApi } from '@tw-stock-hub/api-client'
import type { PartialIndicatorParams } from '@tw-stock-hub/charts'
import { useAuthStore } from '@/stores/auth.store'

const params = ref<PartialIndicatorParams | null>(null)
let loadedFor: string | null = null

export function useChartPrefs() {
  const { user } = storeToRefs(useAuthStore())

  watch(user, async (u) => {
    const id = u?.id ?? null
    if (id === loadedFor) return
    loadedFor = id
    params.value = null
    if (!id) return
    try {
      params.value = (await prefsApi.getChartPrefs()) as PartialIndicatorParams | null
    } catch (e) {
      console.warn('[chartPrefs] load failed', e)
    }
  }, { immediate: true })

  async function save(next: PartialIndicatorParams): Promise<void> {
    await prefsApi.saveChartPrefs(next as Record<string, Record<string, number>>)
    params.value = next
  }

  async function reset(): Promise<void> {
    await prefsApi.resetChartPrefs()
    params.value = null
  }

  return { params, save, reset }
}
