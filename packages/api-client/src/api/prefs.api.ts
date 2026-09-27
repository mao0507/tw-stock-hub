import { apiClient } from '../axios'

const BASE = '/api/portfolio/chart-preferences'

/** 圖表偏好（#36）：指標參數，結構見 @tw-stock-hub/charts 的 IndicatorParams */
export type IndicatorParamsDto = Record<string, Record<string, number>>

export const prefsApi = {
  async getChartPrefs(): Promise<IndicatorParamsDto | null> {
    const { data } = await apiClient.get<{ indicatorParams: IndicatorParamsDto | null }>(BASE)
    return data.indicatorParams
  },

  async saveChartPrefs(indicatorParams: IndicatorParamsDto): Promise<void> {
    await apiClient.put(BASE, { indicatorParams })
  },

  async resetChartPrefs(): Promise<void> {
    await apiClient.delete(BASE)
  },
}
