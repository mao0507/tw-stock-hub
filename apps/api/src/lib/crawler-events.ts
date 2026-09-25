import type postgres from 'postgres'
import { responseCache } from './cache.js'

export const CRAWLER_DONE_CHANNEL = 'crawler_done'

/** 會觸發股利重算的爬蟲（run_job 的任務名稱，與爬蟲類別名稱皆接受） */
const EX_DIVIDEND_CRAWLERS = new Set(['exdividend', 'ExDividendCalendarCrawler'])

export type CrawlerDoneHandlers = {
  /** 除權息行事曆更新後：重算持股的股利權利 */
  onExDividend?: () => Promise<unknown>
}

function crawlerName(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { crawler?: unknown }
    return typeof parsed.crawler === 'string' ? parsed.crawler : null
  } catch {
    return null
  }
}

/**
 * 訂閱 crawler 的 NOTIFY crawler_done（取代 Redis pub/sub）。收到即清空回應快取，
 * 並依爬蟲種類觸發後續處理（Phase 3 在這裡接 Alert 評估）。回傳取消訂閱函式。
 */
export async function startCrawlerDoneListener(
  sql: postgres.Sql,
  handlers: CrawlerDoneHandlers = {},
): Promise<() => Promise<void>> {
  const { unlisten } = await sql.listen(CRAWLER_DONE_CHANNEL, (payload) => {
    console.info('[api] crawler_done', payload)
    responseCache.clear()

    const name = crawlerName(payload)
    if (name && EX_DIVIDEND_CRAWLERS.has(name) && handlers.onExDividend) {
      handlers.onExDividend().catch((err: unknown) => {
        console.error('[api] 除權息更新後重算股利失敗', err)
      })
    }
  })
  return unlisten
}
