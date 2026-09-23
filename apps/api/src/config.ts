import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 字元'),
  JWT_TTL_DAYS: z.coerce.number().int().positive().default(7),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  /** 登入 allowlist，逗號分隔 email */
  ALLOWED_EMAILS: z.string().min(1, 'ALLOWED_EMAILS 不可為空'),
  /** 前端網址：登入後導回、CSRF Origin 檢查 */
  WEB_ORIGIN: z.string().url(),
  ADMIN_API_KEY: z.string().min(16),
})

export type Config = {
  nodeEnv: 'development' | 'production' | 'test'
  port: number
  databaseUrl: string
  jwtSecret: string
  jwtTtlDays: number
  google: { clientId: string; clientSecret: string; redirectUri: string }
  allowedEmails: ReadonlySet<string>
  webOrigin: string
  adminApiKey: string
}

export function parseAllowedEmails(raw: string): ReadonlySet<string> {
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = envSchema.parse(env)
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtTtlDays: e.JWT_TTL_DAYS,
    google: {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      redirectUri: e.GOOGLE_REDIRECT_URI,
    },
    allowedEmails: parseAllowedEmails(e.ALLOWED_EMAILS),
    webOrigin: e.WEB_ORIGIN,
    adminApiKey: e.ADMIN_API_KEY,
  }
}
