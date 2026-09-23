import { defineStore } from 'pinia'
import { ref } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { MarketOverview, SectorHeatmapItem, MarketHistoryItem } from '@tw-stock-hub/types'

type Period = '1M' | '3M' | '6M' | '1Y'

const PERIOD_LIMIT: Record<Period, number> = {
  '1M': 30, '3M': 90, '6M': 180, '1Y': 365,
}

export const useMarketStore = defineStore('market', () => {
  const overview = ref<MarketOverview | null>(null)
  const heatmapData = ref<SectorHeatmapItem[]>([])
  const historyData = ref<MarketHistoryItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchOverview(): Promise<void> {
    try {
      overview.value = await stockApi.getMarketOverview()
    } catch (e) {
      error.value = '無法載入大盤資料'
      console.warn('[MarketStore] fetchOverview failed', e)
    }
  }

  async function fetchHeatmap(): Promise<void> {
    try {
      const res = await stockApi.getMarketHeatmap()
      heatmapData.value = res.sectors
    } catch (e) {
      console.warn('[MarketStore] fetchHeatmap failed', e)
    }
  }

  async function fetchHistory(period: Period): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      historyData.value = await stockApi.getMarketHistory({
        interval: 'daily',
        limit: PERIOD_LIMIT[period],
      })
    } catch (e) {
      error.value = '無法載入走勢資料'
      console.warn('[MarketStore] fetchHistory failed', e)
    } finally {
      isLoading.value = false
    }
  }

  return {
    overview, heatmapData, historyData, isLoading, error,
    fetchOverview, fetchHeatmap, fetchHistory,
  }
})
