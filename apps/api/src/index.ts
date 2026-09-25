import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createDb, runMigrations } from './db/client.js'
import { startCrawlerDoneListener } from './lib/crawler-events.js'
import { recomputeDividendsForStock } from './modules/portfolio/index.js'

const config = loadConfig()
const { sql, db } = createDb(config.databaseUrl)

await runMigrations(db)
// 部署或停機期間可能錯過除權息通知：啟動時補算一次股利
console.info('[api] 啟動時重算股利', await recomputeDividendsForStock(db))

await startCrawlerDoneListener(sql, {
  onExDividend: () => recomputeDividendsForStock(db),
})

const app = createApp({
  config,
  db,
  ping: async () => {
    await sql`SELECT 1`
  },
})

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.info(`[api] listening on :${info.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    void sql.end({ timeout: 5 }).then(() => process.exit(0))
  })
}
