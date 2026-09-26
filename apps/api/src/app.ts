import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import type { Config } from './config.js'
import type { Db } from './db/client.js'
import { createAdminRoutes } from './modules/admin/index.js'
import { createAuthRoutes } from './modules/auth/index.js'
import { createPortfolioRoutes } from './modules/portfolio/index.js'
import { createStockRoutes } from './modules/stock/index.js'
import { createTelegram, type Telegram } from './lib/telegram.js'

export type AppDeps = {
  config: Config
  db: Db
  ping: () => Promise<void>
  /** 測試用：取代真 Google OAuth */
  googleOAuth?: MiddlewareHandler
  /** 未指定時依 config 建立（沒設 token 則停用） */
  telegram?: Telegram
}

export function createApp({ config, db, ping, googleOAuth, telegram }: AppDeps) {
  const app = new OpenAPIHono()

  if (config.nodeEnv !== 'test') app.use(logger())
  app.use('/api/*', csrf({ origin: config.webOrigin }))

  app.get('/health', async (c) => {
    await ping()
    return c.json({ status: 'ok' })
  })

  app.route('/api/auth', createAuthRoutes(config, db, googleOAuth))
  app.route('/api/admin', createAdminRoutes(db, config.adminApiKey))
  app.route('/api/portfolio', createPortfolioRoutes(db, config.jwtSecret, telegram ?? createTelegram(config.telegram)))
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
