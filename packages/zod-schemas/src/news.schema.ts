import { z } from 'zod'

const newsSourceEnum = z.enum(['mops', 'cnyes', 'yahoo', 'moneydj', 'twse'])
const newsCategoryEnum = z.enum([
  'major_announcement',
  'market_news',
  'analyst',
  'official',
])

export const newsItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().nullable(),
  source: newsSourceEnum,
  url: z.string().url(),
  publishedAt: z.string().datetime({ offset: true }),
  category: newsCategoryEnum,
})

export const newsPaginatedSchema = z.object({
  items: z.array(newsItemSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export const newsQuerySchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  source: newsSourceEnum.optional(),
  category: newsCategoryEnum.optional(),
})

export type NewsItemData = z.infer<typeof newsItemSchema>
export type NewsPaginatedData = z.infer<typeof newsPaginatedSchema>
