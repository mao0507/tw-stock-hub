import { z } from 'zod'

export const dailyQuoteItemSchema = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  changePct: z.number().nullable(),
})

export const dailyQuoteSchema = z.array(dailyQuoteItemSchema)

export const marketOverviewSchema = z.object({
  date: z.string(),
  taiexClose: z.number(),
  taiexChange: z.number(),
  taiexChangePct: z.number(),
  totalValue: z.number(),
  totalVolume: z.number(),
  upCount: z.number().int(),
  downCount: z.number().int(),
  flatCount: z.number().int(),
  limitUpCount: z.number().int(),
  limitDownCount: z.number().int(),
})

export const heatmapItemSchema = z.object({
  sectorName: z.string(),
  changePct: z.number(),
  value: z.number(),
  volume: z.number(),
})

export const institutionalItemSchema = z.object({
  date: z.string(),
  foreignNet: z.number(),
  trustNet: z.number(),
  dealerNet: z.number(),
  totalNet: z.number(),
})

export const marginItemSchema = z.object({
  date: z.string(),
  marginBalance: z.number(),
  marginChange: z.number(),
  shortBalance: z.number(),
  shortChange: z.number(),
  ratio: z.number().nullable(),
})

export const stockSearchItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  market: z.enum(['TWSE', 'TPEX']),
  sector: z.string().nullable(),
})

export type DailyQuoteItem = z.infer<typeof dailyQuoteItemSchema>
export type MarketOverviewData = z.infer<typeof marketOverviewSchema>
export type HeatmapItem = z.infer<typeof heatmapItemSchema>
export type InstitutionalItem = z.infer<typeof institutionalItemSchema>
export type MarginItem = z.infer<typeof marginItemSchema>
