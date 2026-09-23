import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createDb, runMigrations } from './db/client.js'
import { responseCache } from './lib/cache.js'
import { createUpsertUser } from './modules/auth/repository.js'

const config = loadConfig()
const { sql, db } = createDb(config.databaseUrl)

await runMigrations(db)

// crawler 完成後 NOTIFY crawler_done（取代 Redis pub/sub）；Phase 3 在這裡接 Alert 評估
await sql.listen('crawler_done', (payload) => {
  console.info('[api] crawler_done', payload)
  responseCache.clear()
})

const app = createApp({
  config,
  db,
  upsertUser: createUpsertUser(db),
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
