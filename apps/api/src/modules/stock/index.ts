import { OpenAPIHono } from '@hono/zod-openapi'
import type { Db } from '../../db/client.js'
import { registerCalendarRoutes } from './calendar.js'
import { registerChipRoutes } from './chips.js'
import { registerFundamentalRoutes } from './fundamentals.js'
import { registerMarketRoutes } from './market.js'
import { registerRankingRoutes } from './rankings.js'
import { registerOverviewRoutes } from './overview.js'
import { registerScreenerRoutes } from './screener.js'
import { registerTechnicalRoutes } from './technical.js'

// 全市場公開資料（Q27：目前只在本機跑，暫不驗證；上線前掛 requireAuth）
export function createStockRoutes(db: Db) {
  const app = new OpenAPIHono()
  registerOverviewRoutes(app, db)
  registerChipRoutes(app, db)
  registerFundamentalRoutes(app, db)
  registerMarketRoutes(app, db)
  registerRankingRoutes(app, db)
  registerCalendarRoutes(app, db)
  registerTechnicalRoutes(app, db)
  registerScreenerRoutes(app, db)
  return app
}
