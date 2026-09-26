import type postgres from 'postgres'
import { responseCache } from './cache.js'

export const CRAWLER_DONE_CHANNEL = 'crawler_done'

/** 會觸發股利重算的爬蟲：除權息行事曆與股利歷史（run_job 任務名稱、爬蟲類別名稱、FinMind 回補皆接受） */
const EX_DIVIDEND_CRAWLERS = new Set([
  'exdividend', 'ExDividendCalendarCrawler', 'dividend', 'DividendCrawler', 'dividend_refresh', 'finmind_dividends',
])

/** 會觸發盤後提醒評估的行情任務 */
const QUOTE_CRAWLERS = new Set(['twse_daily', 'tpex_daily', 'TWSEDailyQuoteCrawler', 'TPEXDailyQuoteCrawler'])

export type CrawlerDoneHandlers = {
  /** 除權息行事曆更新後：重算持股的股利權利 */
  onExDividend?: () => Promise<unknown>
  /** 行情更新後：評估盤後提醒 */
  onQuotes?: () => Promise<unknown>
}

function parsePayload(payload: string): { name: string | null; count: number | null } {
  try {
    const p = JSON.parse(payload) as { crawler?: unknown; count?: unknown }
    return {
      name: typeof p.crawler === 'string' ? p.crawler : null,
      count: typeof p.count === 'number' ? p.count : null,
    }
  } catch {
    return { name: null, count: null }
  }
}

/**
 * 訂閱 crawler 的 NOTIFY crawler_done（取代 Redis pub/sub）。收到即清空回應快取，
 * 並依爬蟲種類觸發後續處理（股利重算、盤後提醒評估）。回傳取消訂閱函式。
 */
export async function startCrawlerDoneListener(
  sql: postgres.Sql,
  handlers: CrawlerDoneHandlers = {},
): Promise<() => Promise<void>> {
  const { unlisten } = await sql.listen(CRAWLER_DONE_CHANNEL, (payload) => {
    console.info('[api] crawler_done', payload)
    responseCache.clear()

    const { name, count } = parsePayload(payload)
    // 行情筆數為 0（休市、尚未公布）不評估，免得拿前一交易日資料觸發剛建立或重設的提醒
    if (name && QUOTE_CRAWLERS.has(name) && count !== 0 && handlers.onQuotes) {
      handlers.onQuotes().catch((err: unknown) => {
        console.error('[api] 行情更新後評估提醒失敗', err)
      })
    }
    if (name && EX_DIVIDEND_CRAWLERS.has(name) && handlers.onExDividend) {
      handlers.onExDividend().catch((err: unknown) => {
        console.error('[api] 除權息更新後重算股利失敗', err)
      })
    }
  })
  return unlisten
}
