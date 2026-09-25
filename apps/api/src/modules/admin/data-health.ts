import { and, count, gte, lte, max, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { Db } from '../../db/client.js'
import {
  dailyQuotes, institutionalTrading, marginTrading, marketIndex, news, sectorPerformance,
} from '../../db/schema/stocks.js'

// 資料健康檢查：各表是否跟上最新交易日、近 30 個交易日缺哪幾天、哪天筆數異常少

const TRADING_DAYS_WINDOW = 30
/** 大盤當天晚上才更新：允許落後 1 天 */
const MARKET_INDEX_STALE_BUFFER_DAYS = 1
const NEWS_STALE_BUFFER_DAYS = 1
/** 某日筆數低於近 30 日中位數的 60% 視為異常 */
const ANOMALY_RATIO = 0.6

const TRADE_TABLES = [
  { tableName: 'daily_quotes', label: '每日行情', table: dailyQuotes, date: dailyQuotes.date },
  { tableName: 'institutional_trading', label: '三大法人', table: institutionalTrading, date: institutionalTrading.date },
  { tableName: 'margin_trading', label: '融資融券', table: marginTrading, date: marginTrading.date },
  { tableName: 'sector_performance', label: '類股指數', table: sectorPerformance, date: sectorPerformance.date },
] as const

type TradeTableName = (typeof TRADE_TABLES)[number]['tableName']

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** today 往前最近的平日（週六日回推到週五）；大盤資料不可信時的後備基準 */
export function lastWeekday(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function tableHealth(tableName: string, label: string, latest: string | null, expected: string, bufferDays: number) {
  const lag = latest ? daysBetween(latest, expected) : null
  const isHealthy = lag !== null && lag <= bufferDays
  return {
    tableName,
    label,
    latestDate: latest,
    expectedDate: expected,
    isHealthy,
    missingDays: lag === null ? 999 : isHealthy ? 0 : lag,
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export async function dataHealth(db: Db, today: string) {
  const maxOf = async (table: PgTable, col: PgColumn, asDate = false) => {
    const [row] = await db.select({ d: asDate ? sql<string | null>`MAX(${col})::date::text` : max(col) }).from(table)
    return (row?.d as string | null) ?? null
  }
  const [marketMax, newsMax, ...tradeMax] = await Promise.all([
    maxOf(marketIndex, marketIndex.date),
    maxOf(news, news.publishedAt, true),
    ...TRADE_TABLES.map((t) => maxOf(t.table, t.date)),
  ])

  // 大盤休市日不寫入，其最新日期即「最後一個交易日」；大盤本身卡住太久時改用平日推算，
  // 避免拿故障中的表掩護其他表落後
  const marketFresh = !!marketMax && daysBetween(marketMax, today) <= MARKET_INDEX_STALE_BUFFER_DAYS
  const lastTradingDay = marketFresh ? marketMax! : lastWeekday(today)

  const tables = [
    tableHealth('market_index', '大盤指數', marketMax, today, MARKET_INDEX_STALE_BUFFER_DAYS),
    ...TRADE_TABLES.map((t, i) => tableHealth(t.tableName, t.label, tradeMax[i] ?? null, lastTradingDay, 0)),
    tableHealth('news', '新聞資料', newsMax, today, NEWS_STALE_BUFFER_DAYS),
  ]

  const tradingDays = (
    await db.select({ d: marketIndex.date }).from(marketIndex).orderBy(sql`${marketIndex.date} DESC`).limit(TRADING_DAYS_WINDOW)
  ).map((r) => r.d)

  const missingByTable = Object.fromEntries(TRADE_TABLES.map((t) => [t.tableName, [] as string[]])) as Record<
    TradeTableName,
    string[]
  >
  const countAnomalies: { tableName: string; label: string; date: string; count: number; expectedCount: number }[] = []

  if (tradingDays.length > 0) {
    const from = tradingDays.at(-1)!
    const to = tradingDays[0]!
    await Promise.all(
      TRADE_TABLES.map(async (t) => {
        const perDay = await db
          .select({ d: t.date, n: count() })
          .from(t.table)
          .where(and(gte(t.date, from), lte(t.date, to)))
          .groupBy(t.date)
        const present = new Set(perDay.map((r) => r.d))
        missingByTable[t.tableName] = tradingDays.filter((d) => !present.has(d)).sort()

        if (perDay.length >= 3) {
          const expected = median(perDay.map((r) => r.n))
          for (const r of perDay) {
            if (r.n < expected * ANOMALY_RATIO) {
              countAnomalies.push({ tableName: t.tableName, label: t.label, date: r.d, count: r.n, expectedCount: Math.round(expected) })
            }
          }
        }
      }),
    )
  }
  countAnomalies.sort((a, b) => a.date.localeCompare(b.date) || a.tableName.localeCompare(b.tableName))

  return { tables, missingByTable, countAnomalies }
}
