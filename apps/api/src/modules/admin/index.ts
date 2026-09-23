import { zValidator } from '@hono/zod-validator'
import { desc } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { pendingJobs } from '../../db/schema/stocks.js'

// admin 後台 API。X-Admin-Key 由 admin 容器的 nginx 在伺服器端注入，瀏覽器拿不到。
export function createAdminRoutes(db: Db, adminApiKey: string) {
  const app = new Hono()

  app.use(async (c, next) => {
    if (c.req.header('X-Admin-Key') !== adminApiKey) return c.json({ error: 'unauthorized' }, 401)
    await next()
  })

  // 手動觸發爬蟲：寫入 pending_jobs，crawler 每分鐘輪詢執行
  app.post('/jobs', zValidator('json', z.object({ job: z.string().regex(/^[a-z_]{1,50}$/) })), async (c) => {
    const { job } = c.req.valid('json')
    const [row] = await db.insert(pendingJobs).values({ jobName: job, status: 'pending' }).returning()
    return c.json(row, 201)
  })

  app.get('/jobs', async (c) => {
    const rows = await db.select().from(pendingJobs).orderBy(desc(pendingJobs.createdAt)).limit(50)
    return c.json(rows)
  })

  return app
}
