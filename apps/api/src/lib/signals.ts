// 技術訊號代碼與名稱：需與 crawler analytics/signals.py 的 SIGNALS、packages/types 的 SIGNAL_META 一致
export const SIGNAL_LABELS = {
  ma_golden_cross: 'MA5 黃金交叉 MA20',
  ma_death_cross: 'MA5 死亡交叉 MA20',
  above_ma20: '站上月線 MA20',
  below_ma20: '跌破月線 MA20',
  above_ma60: '站上季線 MA60',
  below_ma60: '跌破季線 MA60',
  ma_bullish_alignment: '均線多頭排列成形',
  kd_low_golden_cross: 'KD 低檔黃金交叉',
  kd_high_death_cross: 'KD 高檔死亡交叉',
  macd_golden_cross: 'MACD 黃金交叉',
  macd_death_cross: 'MACD 死亡交叉',
  rsi_overbought: 'RSI 進入超買',
  rsi_oversold: 'RSI 進入超賣',
  breakout_20d_high: '突破 20 日新高',
  breakout_60d_high: '突破 60 日新高',
  breakdown_20d_low: '跌破 20 日新低',
  breakdown_60d_low: '跌破 60 日新低',
  volume_spike: '爆量',
  boll_break_upper: '突破布林上軌',
  boll_break_lower: '跌破布林下軌',
} as const

export type SignalCode = keyof typeof SIGNAL_LABELS
export const SIGNAL_CODES = Object.keys(SIGNAL_LABELS) as [SignalCode, ...SignalCode[]]
export const signalLabel = (code: string) => SIGNAL_LABELS[code as SignalCode] ?? code
