export interface WatchlistGroup {
  id: string
  name: string
  /** #RRGGBB */
  color: string | null
  sortOrder: number
}

/** 自選股（附名稱與最新收盤價；查無行情時價格欄位為 null） */
export interface WatchlistItem {
  id: string
  stockId: string
  name: string
  groupId: string | null
  note: string | null
  sortOrder: number
  addedAt: string
  close: number | null
  change: number | null
  changePct: number | null
  priceDate: string | null
}

export interface WatchlistData {
  groups: WatchlistGroup[]
  items: WatchlistItem[]
}

export interface AddWatchlistForm {
  stockId: string
  groupId?: string | null
  note?: string | null
}

export interface UpdateWatchlistItemForm {
  note?: string | null
  groupId?: string | null
  sortOrder?: number
}

export interface WatchlistGroupForm {
  name?: string
  color?: string | null
  sortOrder?: number
}
