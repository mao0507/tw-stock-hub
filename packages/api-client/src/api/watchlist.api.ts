import type { WatchlistItem, AddWatchlistForm } from '@tw-stock-hub/types'
import { apiClient } from '../axios'

export const watchlistApi = {
  async getWatchlist(): Promise<WatchlistItem[]> {
    const { data } = await apiClient.get<WatchlistItem[]>('/api/watchlist')
    return data
  },

  async addToWatchlist(form: AddWatchlistForm): Promise<WatchlistItem> {
    const { data } = await apiClient.post<WatchlistItem>('/api/watchlist', form)
    return data
  },

  async removeFromWatchlist(stockId: string): Promise<void> {
    await apiClient.delete(`/api/watchlist/${stockId}`)
  },

  async updateWatchlistNote(stockId: string, note: string | null): Promise<WatchlistItem> {
    const { data } = await apiClient.patch<WatchlistItem>(`/api/watchlist/${stockId}`, { note })
    return data
  },
}
