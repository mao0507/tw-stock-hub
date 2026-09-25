import { z } from '@hono/zod-openapi'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { stocks } from '../../db/schema/stocks.js'
import { responseCache } from '../../lib/cache.js'

export const StockId = z.string().regex(/^[0-9A-Z]{4,6}$/, '股票代號格式錯誤')
export const IdParam = z.object({ id: StockId })

/** YYYY-MM-DD 且為真實存在的日期（2026-02-30 這類會被拒絕，避免 DB 報錯變 500） */
export const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD')
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`)
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
  }, '日期不存在')
export const ErrorBody = z.object({ error: z.string() })

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

export const num = (v: string | null) => (v === null ? null : Number(v))

/** 以 LRU 快取查詢結果；crawler_done 時整批清空 */
export async function cached<T extends object>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = responseCache.get(key)
  if (hit) return hit as T
  const value = await load()
  responseCache.set(key, value)
  return value
}

/** 上市櫃中的股票（下市視為不存在） */
export async function findActiveStock(db: Db, id: string) {
  const [row] = await db
    .select({ id: stocks.id, name: stocks.name, market: stocks.market, sector: stocks.sector, isActive: stocks.isActive })
    .from(stocks)
    .where(and(eq(stocks.id, id), eq(stocks.isActive, true)))
  return row ?? null
}

export const NOT_FOUND = { notFound: true } as const
export const notFoundBody = (id: string) => ({ error: `找不到股票代號 ${id}` })
