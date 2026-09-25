// 骨架整合測試：DB 初始化、角色權限、壓縮政策、行情 API、crawler_done 清快取、admin 觸發任務。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { startCrawlerDoneListener } from './lib/crawler-events.js'
import { seedQuotes, seedStock, startTestDb, testConfig, type TestDb, waitFor } from './test/harness.js'
import postgres from 'postgres'

let t: TestDb
let app: ReturnType<typeof createApp>
let stopListener: () => Promise<void>

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({
    config: testConfig,
    db: t.api.db,
    ping: async () => {
      await t.api.sql`SELECT 1`
    },
  })
  stopListener = await startCrawlerDoneListener(t.api.sql)
  await seedStock(t.admin, '2330', '台積電')
}, 120_000)

afterAll(async () => {
  await stopListener?.()
  await t?.stop()
})

describe('DB 初始化與角色權限', () => {
  it('crawler 角色讀不到 members', async () => {
    const crawler = postgres(t.urlFor('crawler'), { max: 1 })
    try {
      await expect(crawler`SELECT 1 FROM members.users LIMIT 1`).rejects.toThrow(/permission denied/)
    } finally {
      await crawler.end()
    }
  })

  it('crawler 角色可寫入 stocks', async () => {
    const crawler = postgres(t.urlFor('crawler'), { max: 1 })
    try {
      await crawler`INSERT INTO daily_quotes (date, stock_id, open, high, low, close, volume, value)
                    VALUES ('2020-01-02', '2330', 1, 1, 1, 1, 1, 1)`
    } finally {
      await crawler.end()
    }
  })

  it('api 角色不能寫入 stocks 行情，但可以寫入 pending_jobs', async () => {
    await expect(
      t.api.sql`INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value)
                VALUES ('2020-01-03', '2330', 1, 1, 1, 1, 1, 1)`,
    ).rejects.toThrow(/permission denied/)
    await t.api.sql`INSERT INTO stocks.pending_jobs (job_name) VALUES ('twse_daily')`
  })

  it('所有 hypertable 都有 30 天壓縮政策', async () => {
    const [row] = await t.admin`
      SELECT
        (SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_schema = 'stocks')::int AS hypertables,
        (SELECT count(*) FROM timescaledb_information.jobs
          WHERE proc_name = 'policy_compression' AND hypertable_schema = 'stocks'
            AND config->>'compress_after' = '30 days')::int AS policies`
    expect(row!.hypertables).toBeGreaterThan(0)
    expect(row!.policies).toBe(row!.hypertables)
  })

  it('members migration 已套用', async () => {
    const rows = await t.api.sql`SELECT to_regclass('members.holding_lots') IS NOT NULL AS exists`
    expect(rows[0]!.exists).toBe(true)
  })
})

describe('GET /health', () => {
  it('DB 可連線時回 ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
  })
})

describe('GET /api/stocks/:id/quote', () => {
  it('回傳 seed 的行情（舊到新）', async () => {
    await seedQuotes(t.admin, [
      { date: '2026-09-21', stockId: '2330', close: 1000 },
      { date: '2026-09-22', stockId: '2330', close: 1010 },
    ])
    const res = await app.request('/api/stocks/2330/quote?limit=2')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { date: string; close: string }[]
    expect(body.map((r) => [r.date, Number(r.close)])).toEqual([
      ['2026-09-21', 1000],
      ['2026-09-22', 1010],
    ])
  })

  it('crawler NOTIFY crawler_done 後快取清空，查得到新資料', async () => {
    const url = '/api/stocks/2330/quote?limit=1'
    const first = (await (await app.request(url)).json()) as { close: string }[]
    await seedQuotes(t.admin, [{ date: '2026-09-23', stockId: '2330', close: 1020 }])

    // 尚未通知：仍是快取值
    const cached = (await (await app.request(url)).json()) as { close: string }[]
    expect(cached).toEqual(first)

    await t.admin`SELECT pg_notify('crawler_done', '{"crawler":"twse_daily"}')`
    await waitFor(async () => {
      const body = (await (await app.request(url)).json()) as { close: string }[]
      return Number(body[0]?.close) === 1020
    })
  })

  it('非法代號回 400', async () => {
    const res = await app.request('/api/stocks/abc/quote')
    expect(res.status).toBe(400)
  })
})

describe('admin 手動觸發', () => {
  const headers = { 'X-Admin-Key': testConfig.adminApiKey, 'Content-Type': 'application/json' }

  it('寫入 pending_jobs 並出現在列表', async () => {
    const res = await app.request('/api/admin/jobs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ job: 'market_index' }),
    })
    expect(res.status).toBe(201)
    const list = (await (await app.request('/api/admin/jobs', { headers })).json()) as {
      jobName: string
      status: string
    }[]
    expect(list.some((j) => j.jobName === 'market_index' && j.status === 'pending')).toBe(true)
  })

  it('非法任務名稱回 400', async () => {
    const res = await app.request('/api/admin/jobs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ job: 'DROP TABLE' }),
    })
    expect(res.status).toBe(400)
  })
})
