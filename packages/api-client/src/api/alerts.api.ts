import type { AlertItem, CreateAlertForm } from '@tw-stock-hub/types'
import { apiClient } from '../axios'

export const alertsApi = {
  async getAlerts(): Promise<AlertItem[]> {
    const { data } = await apiClient.get<AlertItem[]>('/api/alerts')
    return data
  },

  async createAlert(form: CreateAlertForm): Promise<AlertItem> {
    const { data } = await apiClient.post<AlertItem>('/api/alerts', form)
    return data
  },

  async deleteAlert(id: string): Promise<void> {
    await apiClient.delete(`/api/alerts/${id}`)
  },

  async resetAlert(id: string): Promise<AlertItem> {
    const { data } = await apiClient.patch<AlertItem>(`/api/alerts/${id}/reset`)
    return data
  },
}
