import { defineStore } from 'pinia'
import { ref } from 'vue'
import { watchlistApi } from '@tw-stock-hub/api-client'
import type { WatchlistItem } from '@tw-stock-hub/types'

export const useWatchlistStore = defineStore('watchlist', () => {
  const watchlist = ref<WatchlistItem[]>([])
  const isLoading = ref(false)

  async function fetchWatchlist(): Promise<void> {
    isLoading.value = true
    try {
      watchlist.value = await watchlistApi.getWatchlist()
    } catch (e) {
      console.warn('[WatchlistStore] fetchWatchlist failed', e)
    } finally {
      isLoading.value = false
    }
  }

  async function add(stockId: string, note?: string): Promise<void> {
    try {
      const item = await watchlistApi.addToWatchlist({ stockId, note })
      watchlist.value = [item, ...watchlist.value]
    } catch (e) {
      console.warn('[WatchlistStore] add failed', e)
      throw e
    }
  }

  async function remove(stockId: string): Promise<void> {
    try {
      await watchlistApi.removeFromWatchlist(stockId)
      watchlist.value = watchlist.value.filter(w => w.stockId !== stockId)
    } catch (e) {
      console.warn('[WatchlistStore] remove failed', e)
      throw e
    }
  }

  async function updateNote(stockId: string, note: string | null): Promise<void> {
    try {
      const updated = await watchlistApi.updateWatchlistNote(stockId, note)
      const idx = watchlist.value.findIndex(w => w.stockId === stockId)
      if (idx !== -1) watchlist.value = watchlist.value.map((w, i) => i === idx ? updated : w)
    } catch (e) {
      console.warn('[WatchlistStore] updateNote failed', e)
      throw e
    }
  }

  return { watchlist, isLoading, fetchWatchlist, add, remove, updateNote }
})
