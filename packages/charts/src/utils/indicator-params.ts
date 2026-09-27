// 副圖指標參數：預設值與可調範圍。範圍需與 api portfolio/chart-prefs.routes.ts 的驗證一致。

export interface IndicatorParams {
  kd: { period: number }
  macd: { fast: number; slow: number; signal: number }
  rsi: { period: number }
  boll: { period: number; stdDev: number }
  atr: { period: number }
  wr: { period: number }
  bias: { period: number }
  dmi: { period: number }
}
export type IndicatorKey = keyof IndicatorParams
export type PartialIndicatorParams = { [K in IndicatorKey]?: IndicatorParams[K] }

type Spec = { key: string; label: string; min: number; max: number; step?: number }

export const INDICATOR_PARAM_SPECS: { key: IndicatorKey; label: string; params: Spec[] }[] = [
  { key: 'kd', label: 'KD', params: [{ key: 'period', label: 'RSV 天數', min: 3, max: 60 }] },
  {
    key: 'macd', label: 'MACD', params: [
      { key: 'fast', label: '快線', min: 2, max: 60 },
      { key: 'slow', label: '慢線', min: 3, max: 120 },
      { key: 'signal', label: '訊號線', min: 2, max: 60 },
    ],
  },
  { key: 'rsi', label: 'RSI', params: [{ key: 'period', label: '天數', min: 2, max: 60 }] },
  {
    key: 'boll', label: '布林通道', params: [
      { key: 'period', label: '天數', min: 5, max: 120 },
      { key: 'stdDev', label: '標準差倍數', min: 0.5, max: 4, step: 0.1 },
    ],
  },
  { key: 'atr', label: 'ATR', params: [{ key: 'period', label: '天數', min: 2, max: 60 }] },
  { key: 'wr', label: '威廉 %R', params: [{ key: 'period', label: '天數', min: 2, max: 60 }] },
  { key: 'bias', label: '乖離率', params: [{ key: 'period', label: '均線天數', min: 2, max: 120 }] },
  { key: 'dmi', label: 'DMI', params: [{ key: 'period', label: '天數', min: 2, max: 60 }] },
]

export const DEFAULT_INDICATOR_PARAMS: IndicatorParams = {
  kd: { period: 9 },
  macd: { fast: 12, slow: 26, signal: 9 },
  rsi: { period: 14 },
  boll: { period: 20, stdDev: 2 },
  atr: { period: 14 },
  wr: { period: 14 },
  bias: { period: 20 },
  dmi: { period: 14 },
}

/** 使用者設定蓋在預設值上（缺的指標用預設） */
export function withDefaults(p?: PartialIndicatorParams | null): IndicatorParams {
  return { ...DEFAULT_INDICATOR_PARAMS, ...(p ?? {}) }
}
