import type {
  AddWatchlistForm, UpdateWatchlistItemForm, WatchlistData, WatchlistGroup, WatchlistGroupForm,
} from '@tw-stock-hub/types'
import { apiClient } from '../axios'

const BASE = '/api/portfolio'

export const watchlistApi = {
  async getWatchlist(): Promise<WatchlistData> {
    const { data } = await apiClient.get<WatchlistData>(`${BASE}/watchlist`)
    return data
  },

  async addToWatchlist(form: AddWatchlistForm): Promise<void> {
    await apiClient.post(`${BASE}/watchlist`, form)
  },

  async removeFromWatchlist(stockId: string): Promise<void> {
    await apiClient.delete(`${BASE}/watchlist/${stockId}`)
  },

  async updateItem(stockId: string, form: UpdateWatchlistItemForm): Promise<void> {
    await apiClient.patch(`${BASE}/watchlist/${stockId}`, form)
  },

  /** 一次設定某分組（null = 未分組）內的完整順序 */
  async reorderItems(groupId: string | null, stockIds: string[]): Promise<void> {
    await apiClient.put(`${BASE}/watchlist/order`, { groupId, stockIds })
  },

  /** 一次設定所有分組順序 */
  async reorderGroups(ids: string[]): Promise<void> {
    await apiClient.put(`${BASE}/watchlist-groups/order`, { ids })
  },

  async createGroup(form: { name: string; color?: string | null }): Promise<WatchlistGroup> {
    const { data } = await apiClient.post<WatchlistGroup>(`${BASE}/watchlist-groups`, form)
    return data
  },

  async updateGroup(id: string, form: WatchlistGroupForm): Promise<WatchlistGroup> {
    const { data } = await apiClient.patch<WatchlistGroup>(`${BASE}/watchlist-groups/${id}`, form)
    return data
  },

  async deleteGroup(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/watchlist-groups/${id}`)
  },
}
