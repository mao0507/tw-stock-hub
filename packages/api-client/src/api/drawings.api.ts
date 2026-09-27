import type { ChartDrawingDto, DrawingPointDto } from '@tw-stock-hub/types'
import { apiClient } from '../axios'

const BASE = '/api/portfolio/drawings'

/** K 線畫線（#37） */
export const drawingsApi = {
  async list(stockId: string): Promise<ChartDrawingDto[]> {
    const { data } = await apiClient.get<ChartDrawingDto[]>(BASE, { params: { stockId } })
    return data
  },

  async create(form: { stockId: string; kind: ChartDrawingDto['kind']; points: DrawingPointDto[] }): Promise<ChartDrawingDto> {
    const { data } = await apiClient.post<ChartDrawingDto>(BASE, form)
    return data
  },

  async update(id: string, points: DrawingPointDto[]): Promise<ChartDrawingDto> {
    const { data } = await apiClient.patch<ChartDrawingDto>(`${BASE}/${id}`, { points })
    return data
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`)
  },
}
