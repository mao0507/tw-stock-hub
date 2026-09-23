import { OpenAPIHono } from '@hono/zod-openapi'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import type { Config } from './config.js'
import type { Db } from './db/client.js'
import { createAdminRoutes } from './modules/admin/index.js'
import { createAuthRoutes, type UpsertUser } from './modules/auth/index.js'
import { createStockRoutes } from './modules/stock/index.js'

export type AppDeps = {
  config: Config
  db: Db
  upsertUser: UpsertUser
  ping: () => Promise<void>
}

export function createApp({ config, db, upsertUser, ping }: AppDeps) {
  const app = new OpenAPIHono()

  if (config.nodeEnv !== 'test') app.use(logger())
  app.use('/api/*', csrf({ origin: config.webOrigin }))

  app.get('/health', async (c) => {
    await ping()
    return c.json({ status: 'ok' })
  })

  app.route('/api/auth', createAuthRoutes(config, upsertUser))
  app.route('/api/admin', createAdminRoutes(db, config.adminApiKey))
  // ponytail: Q27 決議目前只在本機跑，stock 路由暫不驗證；上線前改掛 requireAuth
  app.route('/api', createStockRoutes(db))

  if (config.nodeEnv !== 'production') {
    app.doc('/api/doc', { openapi: '3.0.0', info: { title: 'tw-stock-hub API', version: '0.0.0' } })
  }

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    console.error('[api] unhandled error', err)
    return c.json({ error: '伺服器錯誤' }, 500)
  })

  return app
}
