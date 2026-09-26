import { z } from 'zod'

// 與 api modules/stock/screener.ts 的驗證一致（前端先擋，減少 400）
const range = (min: number, max: number) => z.number().min(min).max(max).optional()

export const screenerFilterSchema = z
  .object({
    market: z.enum(['TWSE', 'TPEX', 'ALL']).optional(),
    sector: z.string().max(50).optional(),
    priceMin: z.number().min(0).optional(),
    priceMax: z.number().min(0).optional(),
    changeMin: range(-100, 100),
    changeMax: range(-100, 100),
    volumeMin: z.number().min(0).optional(),
    foreignNetMin: z.number().optional(),
    trustNetMin: z.number().optional(),
    marginChangeMin: z.number().optional(),
    bullishAlignment: z.boolean().optional(),
    aboveMa20: z.boolean().optional(),
    aboveMa60: z.boolean().optional(),
    rsMin: z.number({ invalid_type_error: '請輸入 1–99' }).int('請輸入整數').min(1, '最小 1').max(99, '最大 99').optional(),
    peMin: z.number().optional(),
    peMax: z.number().optional(),
    pbMax: z.number().optional(),
    yieldMin: range(0, 100),
    grossMarginMin: range(-1000, 1000),
    revenueYoyMin: range(-1000, 1000),
    dividendYearsMin: z.number().int('請輸入整數').min(1).max(50).optional(),
    bigHolderMin: range(0, 100),
  })
  .refine((d) => d.priceMin === undefined || d.priceMax === undefined || d.priceMin <= d.priceMax, {
    message: '股價下限不能大於上限', path: ['priceMax'],
  })
  .refine((d) => d.changeMin === undefined || d.changeMax === undefined || d.changeMin <= d.changeMax, {
    message: '漲跌幅下限不能大於上限', path: ['changeMax'],
  })
  .refine((d) => d.peMin === undefined || d.peMax === undefined || d.peMin <= d.peMax, {
    message: '本益比下限不能大於上限', path: ['peMax'],
  })

export type ScreenerFilterData = z.infer<typeof screenerFilterSchema>
