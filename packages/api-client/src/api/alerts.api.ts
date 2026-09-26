import type { AlertItem, CreateAlertForm, NotificationList } from '@tw-stock-hub/types'
import { apiClient } from '../axios'

const BASE = '/api/portfolio'

export const alertsApi = {
  async getAlerts(): Promise<AlertItem[]> {
    const { data } = await apiClient.get<AlertItem[]>(`${BASE}/alerts`)
    return data
  },

  async createAlert(form: CreateAlertForm): Promise<AlertItem> {
    const { data } = await apiClient.post<AlertItem>(`${BASE}/alerts`, form)
    return data
  },

  async deleteAlert(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/alerts/${id}`)
  },

  async resetAlert(id: string): Promise<AlertItem> {
    const { data } = await apiClient.patch<AlertItem>(`${BASE}/alerts/${id}/reset`)
    return data
  },

  async getNotifications(): Promise<NotificationList> {
    const { data } = await apiClient.get<NotificationList>(`${BASE}/notifications`)
    return data
  },

  /** 未指定 ids 則全部標為已讀 */
  async markRead(ids?: string[]): Promise<void> {
    await apiClient.post(`${BASE}/notifications/read`, ids ? { ids } : {})
  },
}
