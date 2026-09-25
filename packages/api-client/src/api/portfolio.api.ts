import type { CreateLotForm, HoldingLot, HoldingsSummary, UpdateLotForm } from '@tw-stock-hub/types'
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
}
