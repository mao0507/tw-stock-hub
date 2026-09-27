import type { AlertItem, CreateAlertForm, NotificationList, SignalDigest, SignalSubscription } from '@tw-stock-hub/types'
import { apiClient } from '../axios'

const BASE = '/api/portfolio'

export const alertsApi = {
  async getSignalSubscriptions(): Promise<SignalSubscription[]> {
    const { data } = await apiClient.get<SignalSubscription[]>(`${BASE}/signal-subscriptions`)
    return data
  },

  async createSignalSubscription(form: { stockId: string; signal: string }): Promise<SignalSubscription> {
    const { data } = await apiClient.post<SignalSubscription>(`${BASE}/signal-subscriptions`, form)
    return data
  },

  async setSignalSubscriptionActive(id: string, isActive: boolean): Promise<SignalSubscription> {
    const { data } = await apiClient.patch<SignalSubscription>(`${BASE}/signal-subscriptions/${id}`, { isActive })
    return data
  },

  async deleteSignalSubscription(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/signal-subscriptions/${id}`)
  },

  async getSignalDigests(): Promise<SignalDigest[]> {
    const { data } = await apiClient.get<SignalDigest[]>(`${BASE}/signal-digests`)
    return data
  },

  async createSignalDigest(form: { groupId: string | null; signals: string[] }): Promise<SignalDigest> {
    const { data } = await apiClient.post<SignalDigest>(`${BASE}/signal-digests`, form)
    return data
  },

  async setSignalDigestActive(id: string, isActive: boolean): Promise<SignalDigest> {
    const { data } = await apiClient.patch<SignalDigest>(`${BASE}/signal-digests/${id}`, { isActive })
    return data
  },

  async deleteSignalDigest(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/signal-digests/${id}`)
  },

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

  async getTelegram(): Promise<{ enabled: boolean; linked: boolean; botUsername: string | null }> {
    const { data } = await apiClient.get(`${BASE}/telegram`)
    return data
  },

  async createTelegramLink(): Promise<{ code: string; url: string; expiresInMinutes: number }> {
    const { data } = await apiClient.post(`${BASE}/telegram/link`)
    return data
  },

  async confirmTelegramLink(): Promise<void> {
    await apiClient.post(`${BASE}/telegram/link/confirm`)
  },

  async unlinkTelegram(): Promise<void> {
    await apiClient.delete(`${BASE}/telegram`)
  },

  /** 未指定 ids 則全部標為已讀 */
  async markRead(ids?: string[]): Promise<void> {
    await apiClient.post(`${BASE}/notifications/read`, ids ? { ids } : {})
  },
}
