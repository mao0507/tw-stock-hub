import type {
  CreateLotForm, CreateSellForm, HoldingLot, HoldingsSummary, SellTransaction, UpdateLotForm, UpdateSellForm,
} from '@tw-stock-hub/types'
import { apiClient } from '../axios'

export const portfolioApi = {
  async getHoldings(): Promise<HoldingsSummary> {
    const { data } = await apiClient.get<HoldingsSummary>('/api/portfolio/holdings')
    return data
  },

  async listLots(stockId?: string): Promise<HoldingLot[]> {
    const { data } = await apiClient.get<HoldingLot[]>('/api/portfolio/lots', { params: { stockId } })
    return data
  },

  async createLot(form: CreateLotForm): Promise<HoldingLot> {
    const { data } = await apiClient.post<HoldingLot>('/api/portfolio/lots', form)
    return data
  },

  async updateLot(id: string, form: UpdateLotForm): Promise<HoldingLot> {
    const { data } = await apiClient.patch<HoldingLot>(`/api/portfolio/lots/${id}`, form)
    return data
  },

  async deleteLot(id: string): Promise<void> {
    await apiClient.delete(`/api/portfolio/lots/${id}`)
  },

  async listSells(stockId?: string): Promise<SellTransaction[]> {
    const { data } = await apiClient.get<SellTransaction[]>('/api/portfolio/sells', { params: { stockId } })
    return data
  },

  async createSell(form: CreateSellForm): Promise<SellTransaction> {
    const { data } = await apiClient.post<SellTransaction>('/api/portfolio/sells', form)
    return data
  },

  async updateSell(id: string, form: UpdateSellForm): Promise<SellTransaction> {
    const { data } = await apiClient.patch<SellTransaction>(`/api/portfolio/sells/${id}`, form)
    return data
  },

  async deleteSell(id: string): Promise<void> {
    await apiClient.delete(`/api/portfolio/sells/${id}`)
  },
}
