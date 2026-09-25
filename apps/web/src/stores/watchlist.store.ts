import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { watchlistApi } from '@tw-stock-hub/api-client'
import type { WatchlistGroup, WatchlistItem } from '@tw-stock-hub/types'

export type WatchlistSection = { group: WatchlistGroup | null; items: WatchlistItem[] }

const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder

// 自選股與分組；任何異動後以伺服器資料為準重新載入。
export const useWatchlistStore = defineStore('watchlist', () => {
  const groups = ref<WatchlistGroup[]>([])
  const watchlist = ref<WatchlistItem[]>([])
  const isLoading = ref(false)

  /** 依分組順序分段，未分組放最後（沒有未分組股票時省略） */
  const sections = computed<WatchlistSection[]>(() => {
    const inGroup = (id: string | null) => watchlist.value.filter((i) => i.groupId === id).sort(bySortOrder)
    const result: WatchlistSection[] = [...groups.value].sort(bySortOrder).map((g) => ({ group: g, items: inGroup(g.id) }))
    const ungrouped = inGroup(null)
    if (ungrouped.length) result.push({ group: null, items: ungrouped })
    return result
  })

  const isWatched = (stockId: string) => watchlist.value.some((i) => i.stockId === stockId)

  async function fetchWatchlist(): Promise<void> {
    isLoading.value = true
    try {
      const data = await watchlistApi.getWatchlist()
      groups.value = data.groups
      watchlist.value = data.items
    } catch (e) {
      console.warn('[WatchlistStore] fetchWatchlist failed', e)
    } finally {
      isLoading.value = false
    }
  }

  async function add(stockId: string, opts: { groupId?: string | null; note?: string | null } = {}): Promise<void> {
    await watchlistApi.addToWatchlist({ stockId, ...opts })
    await fetchWatchlist()
  }

  async function remove(stockId: string): Promise<void> {
    await watchlistApi.removeFromWatchlist(stockId)
    await fetchWatchlist()
  }

  async function updateNote(stockId: string, note: string | null): Promise<void> {
    await watchlistApi.updateItem(stockId, { note })
    await fetchWatchlist()
  }

  async function moveToGroup(stockId: string, groupId: string | null): Promise<void> {
    await watchlistApi.updateItem(stockId, { groupId })
    await fetchWatchlist()
  }

  /** 陣列中 idx 與 idx+direction 對調；超出範圍回 null */
  function swapped<T>(list: T[], idx: number, direction: -1 | 1): T[] | null {
    const j = idx + direction
    if (idx < 0 || j < 0 || j >= list.length) return null
    const next = [...list]
    ;[next[idx], next[j]] = [next[j]!, next[idx]!]
    return next
  }

  /** 在同一分組內與相鄰項目交換順序（整組順序一次送出）；direction -1 往上、1 往下 */
  async function moveItem(stockId: string, direction: -1 | 1): Promise<void> {
    const current = watchlist.value.find((i) => i.stockId === stockId)
    if (!current) return
    const siblings = watchlist.value.filter((i) => i.groupId === current.groupId).sort(bySortOrder)
    const order = swapped(siblings.map((i) => i.stockId), siblings.indexOf(current), direction)
    if (!order) return
    await watchlistApi.reorderItems(current.groupId, order)
    await fetchWatchlist()
  }

  async function createGroup(name: string, color: string | null = null): Promise<void> {
    await watchlistApi.createGroup({ name, color })
    await fetchWatchlist()
  }

  async function updateGroup(id: string, form: { name?: string; color?: string | null }): Promise<void> {
    await watchlistApi.updateGroup(id, form)
    await fetchWatchlist()
  }

  async function deleteGroup(id: string): Promise<void> {
    await watchlistApi.deleteGroup(id)
    await fetchWatchlist()
  }

  /** 與相鄰分組交換順序（所有分組順序一次送出）；direction -1 往上、1 往下 */
  async function moveGroup(id: string, direction: -1 | 1): Promise<void> {
    const ids = [...groups.value].sort(bySortOrder).map((g) => g.id)
    const order = swapped(ids, ids.indexOf(id), direction)
    if (!order) return
    await watchlistApi.reorderGroups(order)
    await fetchWatchlist()
  }

  return {
    groups, watchlist, isLoading, sections, isWatched,
    fetchWatchlist, add, remove, updateNote, moveToGroup, moveItem,
    createGroup, updateGroup, deleteGroup, moveGroup,
  }
})
