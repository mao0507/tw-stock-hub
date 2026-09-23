import { defineStore } from 'pinia'
import { ref } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { StockLatestQuote, DailyQuote, Institutional, Margin, QuoteParams } from '@tw-stock-hub/types'

export const useStockStore = defineStore('stock', () => {
  const currentStock = ref<StockLatestQuote | null>(null)
  const quoteData = ref<DailyQuote[]>([])
  const institutionalData = ref<Institutional[]>([])
  const marginData = ref<Margin[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  function reset(): void {
    currentStock.value = null
    quoteData.value = []
    institutionalData.value = []
    marginData.value = []
    error.value = null
  }

  async function fetchStock(id: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      currentStock.value = await stockApi.getStockDetail(id)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      error.value = status === 404 ? `找不到股票代號 ${id}` : '載入股票資料失敗'
      console.warn('[StockStore] fetchStock failed', e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchQuote(id: string, params: QuoteParams = {}): Promise<void> {
    try {
      quoteData.value = await stockApi.getStockQuote(id, { limit: 60, ...params })
    } catch (e) {
      console.warn('[StockStore] fetchQuote failed', e)
    }
  }

  async function fetchInstitutional(id: string, days = 20): Promise<void> {
    try {
      institutionalData.value = await stockApi.getStockInstitutional(id, { days })
    } catch (e) {
      console.warn('[StockStore] fetchInstitutional failed', e)
    }
  }

  async function fetchMargin(id: string, days = 20): Promise<void> {
    try {
      marginData.value = await stockApi.getStockMargin(id, { days })
    } catch (e) {
      console.warn('[StockStore] fetchMargin failed', e)
    }
  }

  return {
    currentStock, quoteData, institutionalData, marginData, isLoading, error,
    reset, fetchStock, fetchQuote, fetchInstitutional, fetchMargin,
  }
})
