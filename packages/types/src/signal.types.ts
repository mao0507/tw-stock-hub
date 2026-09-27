/**
 * 技術訊號（#29）。代碼與多空需與 crawler analytics/signals.py 的 SIGNALS 一致。
 * volume_spike 的多空依當日漲跌，以 API 回傳的 side 為準。
 */
export const SIGNAL_META = {
  ma_golden_cross: { label: 'MA5 黃金交叉 MA20', side: 'bull' },
  ma_death_cross: { label: 'MA5 死亡交叉 MA20', side: 'bear' },
  above_ma20: { label: '站上月線 MA20', side: 'bull' },
  below_ma20: { label: '跌破月線 MA20', side: 'bear' },
  above_ma60: { label: '站上季線 MA60', side: 'bull' },
  below_ma60: { label: '跌破季線 MA60', side: 'bear' },
  ma_bullish_alignment: { label: '均線多頭排列成形', side: 'bull' },
  kd_low_golden_cross: { label: 'KD 低檔黃金交叉', side: 'bull' },
  kd_high_death_cross: { label: 'KD 高檔死亡交叉', side: 'bear' },
  macd_golden_cross: { label: 'MACD 黃金交叉', side: 'bull' },
  macd_death_cross: { label: 'MACD 死亡交叉', side: 'bear' },
  rsi_overbought: { label: 'RSI 進入超買', side: 'bear' },
  rsi_oversold: { label: 'RSI 進入超賣', side: 'bull' },
  breakout_20d_high: { label: '突破 20 日新高', side: 'bull' },
  breakout_60d_high: { label: '突破 60 日新高', side: 'bull' },
  breakdown_20d_low: { label: '跌破 20 日新低', side: 'bear' },
  breakdown_60d_low: { label: '跌破 60 日新低', side: 'bear' },
  volume_spike: { label: '爆量', side: 'bull' },
  boll_break_upper: { label: '突破布林上軌', side: 'bull' },
  boll_break_lower: { label: '跌破布林下軌', side: 'bear' },
} as const satisfies Record<string, { label: string; side: SignalSide }>

export type SignalSide = 'bull' | 'bear'
export type SignalCode = keyof typeof SIGNAL_META

export interface TechnicalSignal {
  date: string
  signal: SignalCode
  side: SignalSide
  /** 訊號當時的關鍵數值，例如 { k: 21, d: 19 }、{ close, prior_high } */
  values: Record<string, number>
}

/** 未知代碼（後端新增而前端尚未更新）時的顯示名稱 */
export const signalLabel = (code: string): string =>
  (SIGNAL_META as Record<string, { label: string }>)[code]?.label ?? code

/** 今日訊號（#31）：最新訊號日的一筆（股票 × 訊號） */
export interface TodaySignalItem {
  stockId: string
  stockName: string
  signal: SignalCode
  side: SignalSide
  values: Record<string, number>
  close: number | null
  changePct: number | null
  /** 只有「我的」版本才有 */
  inWatchlist?: boolean
  inHoldings?: boolean
}

export interface TodaySignals {
  date: string | null
  items: TodaySignalItem[]
}

export type SignalScope = 'all' | 'watchlist' | 'holdings' | 'mine'

/** 逐檔訊號訂閱（#33）：該股出現該訊號的交易日通知一次 */
export interface SignalSubscription {
  id: string
  stockId: string
  stockName: string
  signal: string
  isActive: boolean
  /** 最近一次通知的交易日 */
  lastNotifiedDate: string | null
  createdAt: string
}
