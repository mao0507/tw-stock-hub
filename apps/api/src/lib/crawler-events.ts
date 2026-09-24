import type postgres from 'postgres'
import { responseCache } from './cache.js'

export const CRAWLER_DONE_CHANNEL = 'crawler_done'

/**
 * 訂閱 crawler 的 NOTIFY crawler_done（取代 Redis pub/sub）。收到即清空回應快取。
 * Phase 3 在這裡接 Alert 評估。回傳取消訂閱函式。
 */
export async function startCrawlerDoneListener(sql: postgres.Sql): Promise<() => Promise<void>> {
  const { unlisten } = await sql.listen(CRAWLER_DONE_CHANNEL, (payload) => {
    console.info('[api] crawler_done', payload)
    responseCache.clear()
  })
  return unlisten
}
