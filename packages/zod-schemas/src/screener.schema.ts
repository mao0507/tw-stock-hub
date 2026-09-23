import { z } from 'zod'

export const screenerFilterSchema = z
  .object({
    priceMin: z.number().min(0).optional(),
    priceMax: z.number().min(0).optional(),
    changeMin: z.number().min(-100).max(100).optional(),
    changeMax: z.number().min(-100).max(100).optional(),
    volumeMin: z.number().min(0).optional(),
    foreignNetMin: z.number().optional(),
    trustNetMin: z.number().optional(),
    marginChangeMin: z.number().optional(),
    market: z.enum(['TWSE', 'TPEX', 'ALL']).optional(),
    sector: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.priceMin !== undefined && data.priceMax !== undefined) {
        return data.priceMin <= data.priceMax
      }
      return true
    },
    { message: '股價下限不能大於上限', path: ['priceMax'] },
  )
  .refine(
    (data) => {
      if (data.changeMin !== undefined && data.changeMax !== undefined) {
        return data.changeMin <= data.changeMax
      }
      return true
    },
    { message: '漲跌幅下限不能大於上限', path: ['changeMax'] },
  )

export const screenerResultItemSchema = z.object({
  stockId: z.string(),
  stockName: z.string(),
  market: z.string(),
  sector: z.string().nullable(),
  close: z.number(),
  changePct: z.number().nullable(),
  volume: z.number(),
  foreignNet: z.number().nullable(),
  marginChange: z.number().nullable(),
})

export const screenerResponseSchema = z.object({
  total: z.number(),
  items: z.array(screenerResultItemSchema),
})

export type ScreenerFilterData = z.infer<typeof screenerFilterSchema>
export type ScreenerResultItem = z.infer<typeof screenerResultItemSchema>
