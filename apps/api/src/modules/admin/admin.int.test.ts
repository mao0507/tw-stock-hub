// #15 Admin：爬蟲執行紀錄、彙總、資料健康、使用者清單、手動觸發
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createTestUser, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>
const headers = { 'X-Admin-Key': testConfig.adminApiKey, 'Content-Type': 'application/json' }

const get = async <T>(path: string, h: Record<string, string> = headers) => {
  const res = await app.request(`/api/admin${path}`, { headers: h })
  return { status: res.status, body: (await res.json()) as T }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  const log = (name: string, at: string, status: string, records: number | null, err: string | null = null) => t.admin`
    INSERT INTO stocks.crawler_logs (crawler_name, run_at, status, records_count, error_message, duration_ms)
    VALUES (${name}, ${at}, ${status}::stocks.crawler_status_enum, ${records}, ${err}, 100)`
  await log('TWSEDailyQuoteCrawler', '2026-09-23T07:00:00Z', 'success', 1000)
  await log('TWSEDailyQuoteCrawler', '2026-09-24T07:00:00Z', 'failed', null, 'timeout')
  await log('TWSEDailyQuoteCrawler', '2026-09-25T07:00:00Z', 'failed', null, 'timeout')
  await log('MarketIndexCrawler', '2026-09-25T07:10:00Z', 'success', 1)
  await log('NeverSucceeded', '2026-09-25T08:00:00Z', 'failed', null, 'boom')
  // partial 會中斷連續失敗（與 crawler 告警計數一致）
  await log('PartialBreaks', '2026-09-22T07:00:00Z', 'success', 1)
  await log('PartialBreaks', '2026-09-23T07:00:00Z', 'failed', null)
  await log('PartialBreaks', '2026-09-24T07:00:00Z', 'partial', 1)
  await log('PartialBreaks', '2026-09-25T07:00:00Z', 'failed', null)
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('權限', () => {
  it.each(['/crawler-logs', '/crawler-logs/summary', '/data-health', '/users', '/jobs'])('%s 缺少或錯誤的 key 回 401', async (p) => {
    expect((await get(p, {})).status).toBe(401)
    expect((await get(p, { 'X-Admin-Key': 'wrong-key-wrong-key' })).status).toBe(401)
  })
})

describe('爬蟲執行紀錄', () => {
  it('新到舊分頁，含總筆數', async () => {
    const { body } = await get<{ items: { crawlerName: string; runAt: string }[]; total: number; page: number; pageSize: number }>(
      '/crawler-logs?pageSize=2',
    )
    expect(body.total).toBe(9)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(2)
    expect(body.items.map((l) => l.crawlerName)).toEqual(['NeverSucceeded', 'MarketIndexCrawler'])
    expect(body.items[0]).toMatchObject({ status: 'failed', errorMessage: 'boom', durationMs: 100, recordsCount: null })
  })

  it('依爬蟲、狀態、時間區間篩選', async () => {
    const r = await get<{ items: { runAt: string }[]; total: number }>(
      '/crawler-logs?crawlerName=TWSEDailyQuoteCrawler&status=failed&from=2026-09-25T00:00:00%2B08:00',
    )
    expect(r.body.total).toBe(1)
    expect(r.body.items[0]!.runAt).toBe('2026-09-25T07:00:00.000Z')
  })

  it('參數錯誤回 400', async () => {
    expect((await get('/crawler-logs?pageSize=101')).status).toBe(400)
    expect((await get('/crawler-logs?status=weird')).status).toBe(400)
    expect((await get('/crawler-logs?from=yesterday')).status).toBe(400)
  })
})

describe('爬蟲彙總', () => {
  it('每個爬蟲的最後狀態、最後成功時間與連續失敗次數', async () => {
    const { body } = await get<Record<string, unknown>[]>('/crawler-logs/summary')
    expect(body).toEqual([
      {
        crawlerName: 'MarketIndexCrawler',
        lastRunAt: '2026-09-25T07:10:00.000Z',
        lastStatus: 'success',
        lastRecords: 1,
        lastSuccessAt: '2026-09-25T07:10:00.000Z',
        consecutiveFailures: 0,
      },
      {
        crawlerName: 'NeverSucceeded',
        lastRunAt: '2026-09-25T08:00:00.000Z',
        lastStatus: 'failed',
        lastRecords: null,
        lastSuccessAt: null,
        consecutiveFailures: 1,
      },
      {
        crawlerName: 'PartialBreaks',
        lastRunAt: '2026-09-25T07:00:00.000Z',
        lastStatus: 'failed',
        lastRecords: null,
        lastSuccessAt: '2026-09-22T07:00:00.000Z',
        consecutiveFailures: 1,
      },
      {
        crawlerName: 'TWSEDailyQuoteCrawler',
        lastRunAt: '2026-09-25T07:00:00.000Z',
        lastStatus: 'failed',
        lastRecords: null,
        lastSuccessAt: '2026-09-23T07:00:00.000Z',
        consecutiveFailures: 2,
      },
    ])
  })
})

describe('使用者清單（唯讀）', () => {
  it('列出 email、名稱、首次與最近登入', async () => {
    const u = await createTestUser(t.admin, 'friend@example.com')
    await t.admin`UPDATE members.users SET last_login_at = '2026-09-20T01:00:00Z' WHERE id = ${u.id}`
    const { body } = await get<Record<string, unknown>[]>('/users')
    expect(body).toEqual([
      expect.objectContaining({ id: u.id, email: 'friend@example.com', nickname: 'friend', lastLoginAt: '2026-09-20T01:00:00.000Z' }),
    ])
    expect(body[0]!['createdAt']).toEqual(expect.any(String))
  })
})

describe('手動觸發', () => {
  it('接受任務名稱或爬蟲類別名稱', async () => {
    for (const job of ['twse_daily', 'TWSEDailyQuoteCrawler']) {
      const res = await app.request('/api/admin/jobs', { method: 'POST', headers, body: JSON.stringify({ job }) })
      expect(res.status).toBe(201)
    }
    const { body } = await get<{ jobName: string }[]>('/jobs')
    expect(body.map((j) => j.jobName)).toEqual(['TWSEDailyQuoteCrawler', 'twse_daily'])
  })
})

describe('資料健康', () => {
  it('無資料時各表標記不健康', async () => {
    const { body } = await get<{ tables: { tableName: string; isHealthy: boolean; latestDate: string | null }[] }>('/data-health')
    expect(body.tables.map((x) => x.tableName)).toEqual([
      'market_index', 'daily_quotes', 'institutional_trading', 'margin_trading', 'sector_performance', 'news',
    ])
    expect(body.tables.every((x) => !x.isHealthy && x.latestDate === null)).toBe(true)
  })

  it('以大盤最新交易日為基準找出落後、缺日與筆數異常', async () => {
    const a = t.admin
    const days = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
    for (const d of days) {
      await a`
        INSERT INTO stocks.market_index
          (date, taiex_close, taiex_change, taiex_change_pct, total_volume, total_value,
           up_count, down_count, flat_count, limit_up_count, limit_down_count)
        VALUES (${d}, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0)`
    }
    await a`INSERT INTO stocks.stocks (id, name, market) VALUES ('7501', 'A', 'TWSE'), ('7502', 'B', 'TWSE'), ('7503', 'C', 'TWSE') ON CONFLICT DO NOTHING`
    // 每日行情：09-22 缺；09-24 只有 1 檔（中位數 3 的 60% 以下）
    for (const d of ['2026-09-21', '2026-09-23', '2026-09-25']) {
      for (const id of ['7501', '7502', '7503']) {
        await a`INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value) VALUES (${d}, ${id}, 1, 1, 1, 1, 1, 1)`
      }
    }
    await a`INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value) VALUES ('2026-09-24', '7501', 1, 1, 1, 1, 1, 1)`
    // 三大法人落後到 09-24
    await a`
      INSERT INTO stocks.institutional_trading
        (date, stock_id, foreign_buy, foreign_sell, foreign_net, trust_buy, trust_sell, trust_net,
         dealer_buy, dealer_sell, dealer_net, total_net)
      VALUES ('2026-09-24', '7501', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`

    const { body } = await get<{
      tables: { tableName: string; isHealthy: boolean; latestDate: string | null; expectedDate: string; missingDays: number }[]
      missingByTable: Record<string, string[]>
      countAnomalies: { tableName: string; date: string; count: number; expectedCount: number }[]
    }>('/data-health?today=2026-09-25')
    const byName = Object.fromEntries(body.tables.map((x) => [x.tableName, x]))
    expect(byName['market_index']).toMatchObject({ isHealthy: true, latestDate: '2026-09-25' })
    expect(byName['daily_quotes']).toMatchObject({ isHealthy: true, expectedDate: '2026-09-25' })
    expect(byName['institutional_trading']).toMatchObject({ isHealthy: false, latestDate: '2026-09-24', missingDays: 1 })
    expect(body.missingByTable['daily_quotes']).toEqual(['2026-09-22'])
    expect(body.countAnomalies).toEqual([
      { tableName: 'daily_quotes', label: '每日行情', date: '2026-09-24', count: 1, expectedCount: 3 },
    ])
  })
})
