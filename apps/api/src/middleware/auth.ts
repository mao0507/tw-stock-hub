import type { MiddlewareHandler } from 'hono'
import { jwt } from 'hono/jwt'

export const AUTH_COOKIE = 'token'

export type AuthPayload = {
  sub: string
  email: string
  name: string
  exp: number
}

export type AuthEnv = { Variables: { jwtPayload: AuthPayload } }

/** 從 httpOnly cookie 驗證 JWT，失敗回 401。 */
export function requireAuth(secret: string): MiddlewareHandler {
  return jwt({ secret, cookie: AUTH_COOKIE, alg: 'HS256' })
}
