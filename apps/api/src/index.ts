import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createDb, runMigrations } from './db/client.js'
import { startCrawlerDoneListener } from './lib/crawler-events.js'
import { createUpsertUser } from './modules/auth/repository.js'

const config = loadConfig()
const { sql, db } = createDb(config.databaseUrl)

await runMigrations(db)

await startCrawlerDoneListener(sql)

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
