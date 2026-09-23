import type { Db } from '../../db/client.js'
import { users } from '../../db/schema/members.js'
import type { UpsertUser } from './index.js'

export function createUpsertUser(db: Db): UpsertUser {
  return async ({ googleId, email, name, avatarUrl }) => {
    const [row] = await db
      .insert(users)
      .values({ googleId, email, nickname: name.slice(0, 50), avatarUrl })
      .onConflictDoUpdate({
        target: users.googleId,
        set: { email, avatarUrl, updatedAt: new Date() },
      })
      .returning({ id: users.id })
    return row!
  }
}
