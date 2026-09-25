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
    /** 登入時建立或更新使用者，並記錄 last_login_at。暱稱只在首次建立時取自 Google。 */
    async upsertOnLogin({ googleId, email, name, avatarUrl }: GoogleProfile): Promise<PublicUser> {
      const now = new Date()
      const [row] = await db
        .insert(users)
        .values({ googleId, email, nickname: name.slice(0, 50), avatarUrl, lastLoginAt: now })
        .onConflictDoUpdate({
          target: users.googleId,
          set: { email, avatarUrl, lastLoginAt: now, updatedAt: now },
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
