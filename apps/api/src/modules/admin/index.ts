import { zValidator } from '@hono/zod-validator'
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { crawlerLogs, pendingJobs } from '../../db/schema/stocks.js'
import { listUsers } from '../auth/index.js'
import { todayInTaipei } from '../portfolio/dates.js'
import { dataHealth } from './data-health.js'

// admin 後台 API。X-Admin-Key 由 admin 容器的 nginx 在伺服器端注入，瀏覽器拿不到。

const LogQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  crawlerName: z.string().max(100).optional(),
  status: z.enum(['success', 'failed', 'partial']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString())

export function createAdminRoutes(db: Db, adminApiKey: string) {
  const app = new Hono()

  app.use(async (c, next) => {
    if (c.req.header('X-Admin-Key') !== adminApiKey) return c.json({ error: 'unauthorized' }, 401)
    await next()
  })

  app.get('/crawler-logs', zValidator('query', LogQuery), async (c) => {
    const q = c.req.valid('query')
    const where = and(
      q.crawlerName ? eq(crawlerLogs.crawlerName, q.crawlerName) : undefined,
      q.status ? eq(crawlerLogs.status, q.status) : undefined,
      q.from ? gte(crawlerLogs.runAt, new Date(q.from)) : undefined,
      q.to ? lte(crawlerLogs.runAt, new Date(q.to)) : undefined,
    )
    const [items, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select()
        .from(crawlerLogs)
        .where(where)
        .orderBy(desc(crawlerLogs.runAt), desc(crawlerLogs.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ total: count() }).from(crawlerLogs).where(where),
    ])
    return c.json({
      items: items.map((l) => ({ ...l, runAt: iso(l.runAt) })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    })
  })

  // 每個爬蟲：最後一次執行、最後一次成功、目前連續失敗次數
  app.get('/crawler-logs/summary', async (c) => {
    const rows = await db.execute<{
      crawler_name: string
      last_run_at: Date
      last_status: string
      last_records: number | null
      last_success_at: Date | null
      consecutive_failures: number
    }>(sql`
      WITH ranked AS (
        SELECT crawler_name, run_at, status, records_count,
               ROW_NUMBER() OVER (PARTITION BY crawler_name ORDER BY run_at DESC, id DESC) AS rn
        FROM stocks.crawler_logs
      ),
      last_ok AS (
        SELECT crawler_name, MAX(run_at) AS at FROM stocks.crawler_logs WHERE status = 'success' GROUP BY crawler_name
      ),
      -- 連續失敗從「最後一筆非 failed」之後起算（partial 也會中斷），與 crawler 告警計數一致
      last_not_failed AS (
        SELECT crawler_name, MAX(run_at) AS at FROM stocks.crawler_logs WHERE status <> 'failed' GROUP BY crawler_name
      )
      SELECT r.crawler_name, r.run_at AS last_run_at, r.status AS last_status, r.records_count AS last_records,
             o.at AS last_success_at,
             (SELECT COUNT(*)::int FROM stocks.crawler_logs f
               WHERE f.crawler_name = r.crawler_name AND f.status = 'failed'
                 AND (n.at IS NULL OR f.run_at > n.at)) AS consecutive_failures
      FROM ranked r
      LEFT JOIN last_ok o USING (crawler_name)
      LEFT JOIN last_not_failed n USING (crawler_name)
      WHERE r.rn = 1
      ORDER BY r.crawler_name`)
    return c.json(
      rows.map((r) => ({
        crawlerName: r.crawler_name,
        lastRunAt: iso(r.last_run_at),
        lastStatus: r.last_status,
        lastRecords: r.last_records,
        lastSuccessAt: iso(r.last_success_at),
        consecutiveFailures: r.consecutive_failures,
      })),
    )
  })

  app.get('/data-health', zValidator('query', z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })), async (c) =>
    c.json(await dataHealth(db, c.req.valid('query').today ?? todayInTaipei())),
  )

  // 唯讀：移除存取權請改 ALLOWED_EMAILS（已發出的登入在 JWT 到期前仍有效）
  app.get('/users', async (c) => {
    const users = await listUsers(db)
    return c.json(users.map((u) => ({ ...u, createdAt: iso(u.createdAt), lastLoginAt: iso(u.lastLoginAt) })))
  })

  // 手動觸發爬蟲：寫入 pending_jobs，crawler 每分鐘輪詢執行。
  // 接受任務名稱（twse_daily）或爬蟲類別名稱（TWSEDailyQuoteCrawler），由 crawler 端解析
  app.post('/jobs', zValidator('json', z.object({ job: z.string().regex(/^[A-Za-z_]{1,50}$/) })), async (c) => {
    const { job } = c.req.valid('json')
    const [row] = await db.insert(pendingJobs).values({ jobName: job, status: 'pending' }).returning()
    return c.json(row, 201)
  })

  app.get('/jobs', async (c) => {
    const rows = await db.select().from(pendingJobs).orderBy(desc(pendingJobs.createdAt), desc(pendingJobs.id)).limit(50)
    return c.json(rows)
  })

  return app
}
