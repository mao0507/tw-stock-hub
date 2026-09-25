import { OpenAPIHono } from '@hono/zod-openapi'
import type { Db } from '../../db/client.js'
import { registerChipRoutes } from './chips.js'
import { registerOverviewRoutes } from './overview.js'

// 全市場公開資料（Q27：目前只在本機跑，暫不驗證；上線前掛 requireAuth）
export function createStockRoutes(db: Db) {
  const app = new OpenAPIHono()
  registerOverviewRoutes(app, db)
  registerChipRoutes(app, db)
  return app
}
