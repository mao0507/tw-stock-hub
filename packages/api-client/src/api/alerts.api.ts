import type { AlertItem, CreateAlertForm } from '@tw-stock-hub/types'
import { authApiClient } from '../axios'

export const alertsApi = {
  async getAlerts(): Promise<AlertItem[]> {
    const { data } = await authApiClient.get<AlertItem[]>('/api/alerts')
    return data
  },

  async createAlert(form: CreateAlertForm): Promise<AlertItem> {
    const { data } = await authApiClient.post<AlertItem>('/api/alerts', form)
    return data
  },

  async deleteAlert(id: string): Promise<void> {
    await authApiClient.delete(`/api/alerts/${id}`)
  },

  async resetAlert(id: string): Promise<AlertItem> {
    const { data } = await authApiClient.patch<AlertItem>(`/api/alerts/${id}/reset`)
    return data
  },
}
