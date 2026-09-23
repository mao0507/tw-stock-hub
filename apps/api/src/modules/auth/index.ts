import { googleAuth } from '@hono/oauth-providers/google'
import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import type { Config } from '../../config.js'
import { AUTH_COOKIE, type AuthEnv, type AuthPayload, requireAuth } from '../../middleware/auth.js'

export type GoogleProfile = { googleId: string; email: string; name: string; avatarUrl?: string }
export type UpsertUser = (profile: GoogleProfile) => Promise<{ id: string }>

export function isAllowed(email: string | undefined, allowed: ReadonlySet<string>): boolean {
  return !!email && allowed.has(email.trim().toLowerCase())
}

export function createAuthRoutes(config: Config, upsertUser: UpsertUser) {
  const app = new Hono<AuthEnv>()

  app.get(
    '/google',
    googleAuth({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
    }),
    async (c) => {
      const g = c.get('user-google')
      if (!g?.id || !g.verified_email || !isAllowed(g.email, config.allowedEmails)) {
        return c.text('此帳號不在邀請名單內', 403)
      }
      const email = g.email!.toLowerCase()
      const name = g.name ?? email
      const user = await upsertUser({ googleId: g.id, email, name, avatarUrl: g.picture })

      const maxAge = config.jwtTtlDays * 24 * 60 * 60
      const payload: AuthPayload = {
        sub: user.id,
        email,
        name,
        exp: Math.floor(Date.now() / 1000) + maxAge,
      }
      setCookie(c, AUTH_COOKIE, await sign(payload, config.jwtSecret, 'HS256'), {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge,
      })
      return c.redirect(config.webOrigin)
    },
  )

  app.get('/me', requireAuth(config.jwtSecret), (c) => {
    const { sub, email, name } = c.get('jwtPayload')
    return c.json({ id: sub, email, name })
  })

  app.post('/logout', (c) => {
    deleteCookie(c, AUTH_COOKIE, { path: '/', secure: true })
    return c.body(null, 204)
  })

  return app
}
