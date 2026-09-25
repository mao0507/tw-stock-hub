import { googleAuth } from '@hono/oauth-providers/google'
import { type MiddlewareHandler, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import type { Config } from '../../config.js'
import type { Db } from '../../db/client.js'
import { AUTH_COOKIE, type AuthEnv, type AuthPayload, requireAuth } from '../../middleware/auth.js'
import { createUserRepository } from './repository.js'

/** 供 admin 模組列出使用者（唯讀） */
export const listUsers = (db: Db) => createUserRepository(db).listAll()

const REDIRECT_COOKIE = 'login_redirect'

/** 只接受站內絕對路徑（/foo），擋掉 //host、/\host、完整網址等 open redirect。 */
export function safeRedirectPath(value: string | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null
  return value
}

export function isAllowed(email: string | undefined, allowed: ReadonlySet<string>): boolean {
  return !!email && allowed.has(email.trim().toLowerCase())
}

export function createGoogleOAuth(config: Config): MiddlewareHandler {
  return googleAuth({
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.redirectUri,
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  })
}

/**
 * @param googleOAuth 預設為真 Google OAuth；測試可注入假的 middleware（設定 `user-google`）
 */
export function createAuthRoutes(config: Config, db: Db, googleOAuth = createGoogleOAuth(config)) {
  const app = new Hono<AuthEnv & { Variables: { loginRedirect?: string } }>()
  const repo = createUserRepository(db)

  // 第一次進來（還沒去 Google）記下登入後要回去的頁面；Google 回呼時 query 已不在，改由 cookie 帶回
  const rememberRedirect: MiddlewareHandler = async (c, next) => {
    const target = safeRedirectPath(c.req.query('redirect'))
    if (target) {
      c.set('loginRedirect', target)
      setCookie(c, REDIRECT_COOKIE, target, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/api/auth', maxAge: 600 })
    }
    await next()
  }

  app.get('/google', rememberRedirect, googleOAuth, async (c) => {
    const remembered = getCookie(c, REDIRECT_COOKIE)
    if (remembered) deleteCookie(c, REDIRECT_COOKIE, { path: '/api/auth', secure: true })
    const target = c.get('loginRedirect') ?? safeRedirectPath(remembered)

    const g = c.get('user-google')
    if (!g?.id || !g.verified_email || !isAllowed(g.email, config.allowedEmails)) {
      return c.redirect(`${config.webOrigin}/login?error=not_invited`)
    }
    const email = g.email!.trim().toLowerCase()
    const user = await repo.upsertOnLogin({ googleId: g.id, email, name: g.name ?? email, avatarUrl: g.picture })

    const maxAge = config.jwtTtlDays * 24 * 60 * 60
    const payload: AuthPayload = {
      sub: user.id,
      email,
      name: user.nickname,
      exp: Math.floor(Date.now() / 1000) + maxAge,
    }
    setCookie(c, AUTH_COOKIE, await sign(payload, config.jwtSecret, 'HS256'), {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge,
    })
    return c.redirect(`${config.webOrigin}${target ?? ''}`)
  })

  app.get('/me', requireAuth(config.jwtSecret), async (c) => {
    const user = await repo.findById(c.get('jwtPayload').sub)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    return c.json(user)
  })

  app.post('/logout', (c) => {
    deleteCookie(c, AUTH_COOKIE, { path: '/', secure: true })
    return c.body(null, 204)
  })

  return app
}
