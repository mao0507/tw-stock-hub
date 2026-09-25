import { defineStore } from 'pinia'
import { ref } from 'vue'
import { portfolioApi } from '@tw-stock-hub/api-client'
import type { CreateLotForm, Holding, PortfolioTotals, UpdateLotForm } from '@tw-stock-hub/types'

// 持股彙總一律由後端重算；任何批次異動後重新載入，前端不自行推算。
export const usePortfolioStore = defineStore('portfolio', () => {
  const holdings = ref<Holding[]>([])
  const totals = ref<PortfolioTotals | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchHoldings(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const data = await portfolioApi.getHoldings()
      holdings.value = data.items
      totals.value = data.totals
    } catch (e) {
      console.warn('[PortfolioStore] fetchHoldings failed', e)
      error.value = '持股載入失敗，請稍後再試'
    } finally {
      isLoading.value = false
    }
  }

  async function addLot(form: CreateLotForm): Promise<void> {
    await portfolioApi.createLot(form)
    await fetchHoldings()
  }

  async function updateLot(id: string, form: UpdateLotForm): Promise<void> {
    await portfolioApi.updateLot(id, form)
    await fetchHoldings()
  }

  async function removeLot(id: string): Promise<void> {
    await portfolioApi.deleteLot(id)
    await fetchHoldings()
  }

  return { holdings, totals, isLoading, error, fetchHoldings, addLot, updateLot, removeLot }
})
