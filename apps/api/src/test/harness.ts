// 整合測試工具：TimescaleDB 測試容器（跑 db/init + members migration）、seed、JWT cookie。
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sign } from 'hono/jwt'
import postgres from 'postgres'
import type { Config } from '../config.js'
import { parseAllowedEmails } from '../config.js'
import { createDb, runMigrations } from '../db/client.js'
import type { AuthPayload } from '../middleware/auth.js'

const INIT_DIR = path.resolve(import.meta.dirname, '../../../../db/init')
const PASSWORDS = { postgres: 'postgres', api: 'api', crawler: 'crawler' } as const

export const testConfig: Config = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'postgres://unused',
  jwtSecret: 'x'.repeat(32),
  jwtTtlDays: 7,
  google: { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/api/auth/google' },
  allowedEmails: parseAllowedEmails('me@example.com,friend@example.com'),
  webOrigin: 'http://localhost:8080',
  adminApiKey: 'k'.repeat(16),
}

export type TestDb = Awaited<ReturnType<typeof startTestDb>>

/**
 * 啟動一個與正式環境相同初始化流程的 DB。
 * ponytail: 每個測試檔各起一個容器（約 10 秒）；檔案多到拖慢時改 vitest globalSetup 共用。
 */
export async function startTestDb() {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('timescale/timescaledb:latest-pg17')
    .withDatabase('hub')
    .withUsername('postgres')
    .withPassword(PASSWORDS.postgres)
    .withEnvironment({
      API_DB_PASSWORD: PASSWORDS.api,
      CRAWLER_DB_PASSWORD: PASSWORDS.crawler,
      NO_TS_TUNE: 'true',
    })
    .withCopyDirectoriesToContainer([{ source: INIT_DIR, target: '/docker-entrypoint-initdb.d' }])
    .start()

  const urlFor = (role: keyof typeof PASSWORDS) =>
    `postgres://${role}:${PASSWORDS[role]}@${container.getHost()}:${container.getPort()}/hub`

  // api 以 api 角色連線，與正式環境相同；migration 也以 api 身分執行
  const api = createDb(urlFor('api'))
  // seed 用 superuser：api 角色對 stocks 只有讀權限
  const admin = postgres(urlFor('postgres'), { max: 2, onnotice: () => {} })
  try {
    await runMigrations(api.db)
  } catch (err) {
    // 失敗時呼叫端拿不到 stop()，這裡自行清掉連線與容器
    await Promise.allSettled([api.sql.end(), admin.end()])
    await container.stop()
    throw err
  }

  return {
    urlFor,
    api,
    admin,
    async stop() {
      await Promise.all([api.sql.end(), admin.end()])
      await container.stop()
    },
  }
}

export type QuoteSeed = { date: string; stockId: string; close: number; volume?: number }

export async function seedStock(admin: postgres.Sql, id: string, name: string, market: 'TWSE' | 'TPEX' = 'TWSE') {
  await admin`
    INSERT INTO stocks.stocks (id, name, market) VALUES (${id}, ${name}, ${market})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`
}

export async function seedQuotes(admin: postgres.Sql, rows: QuoteSeed[]) {
  for (const r of rows) {
    await admin`
      INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value)
      VALUES (${r.date}, ${r.stockId}, ${r.close}, ${r.close}, ${r.close}, ${r.close}, ${r.volume ?? 1000}, 0)
      ON CONFLICT (date, stock_id) DO UPDATE SET close = EXCLUDED.close`
  }
}

export async function authCookie(user: Partial<AuthPayload> = {}, secret = testConfig.jwtSecret) {
  const payload: AuthPayload = {
    sub: '00000000-0000-0000-0000-000000000001',
    email: 'me@example.com',
    name: 'Me',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...user,
  }
  return `token=${await sign(payload, secret, 'HS256')}`
}

/** 等待條件成立（用於 LISTEN/NOTIFY 等非同步副作用）。 */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms`)
}

/** 建立 members.users 使用者並回傳其 id 與登入 cookie（portfolio 資料以 FK 綁使用者）。 */
export async function createTestUser(admin: postgres.Sql, email: string) {
  const [row] = await admin`
    INSERT INTO members.users (email, google_id, nickname)
    VALUES (${email}, ${`g-${email}`}, ${email.split('@')[0]!})
    RETURNING id`
  const id = row!.id as string
  return { id, cookie: await authCookie({ sub: id, email }) }
}
