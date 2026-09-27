import { asc, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema/members.js'

export type GoogleProfile = { googleId: string; email: string; name: string; avatarUrl?: string }
export type PublicUser = { id: string; email: string; nickname: string; avatarUrl: string | null }

const publicColumns = {
  id: users.id,
  email: users.email,
  nickname: users.nickname,
  avatarUrl: users.avatarUrl,
}

export function createUserRepository(db: Db) {
  return {
    /**
     * 登入時建立或更新使用者，並記錄 last_login_at。暱稱只在首次建立時取自 Google。
     * 身分以 email 為準（邀請名單就是 email）：
     *   1. 同一 Google ID 已存在 → 更新（涵蓋使用者改了 Google 帳號 email）
     *   2. 否則以 email 寫入；同 email 已存在（例如手動建立、Google ID 不同）→ 沿用該帳號並補上 Google ID
     */
    async upsertOnLogin({ googleId, email, name, avatarUrl }: GoogleProfile): Promise<PublicUser> {
      const now = new Date()
      const [byGoogle] = await db
        .update(users)
        .set({ email, avatarUrl, lastLoginAt: now, updatedAt: now })
        .where(eq(users.googleId, googleId))
        .returning(publicColumns)
      if (byGoogle) return byGoogle
      const [row] = await db
        .insert(users)
        .values({ googleId, email, nickname: name.slice(0, 50), avatarUrl, lastLoginAt: now })
        .onConflictDoUpdate({
          target: users.email,
          set: { googleId, avatarUrl, lastLoginAt: now, updatedAt: now },
        })
        .returning(publicColumns)
      return row!
    },

    async listAll() {
      return db
        .select({ ...publicColumns, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
        .from(users)
        .orderBy(asc(users.createdAt))
    },

    async findById(id: string): Promise<PublicUser | null> {
      const [row] = await db.select(publicColumns).from(users).where(eq(users.id, id))
      return row ?? null
    },
  }
}

export type UserRepository = ReturnType<typeof createUserRepository>
