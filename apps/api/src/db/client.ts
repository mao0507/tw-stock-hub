import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export type Db = ReturnType<typeof createDb>['db']

export function createDb(url: string) {
  // ponytail: 單體 + 少數使用者，max 5 足夠；上線後依 pg_stat_activity 調整
  const sql = postgres(url, { max: 5, onnotice: () => {} })
  return { sql, db: drizzle(sql) }
}

export async function runMigrations(db: Db): Promise<void> {
  // migration 紀錄表與業務表同放 members schema，備份 pg_dump -n members 時一併帶走
  await migrate(db, { migrationsFolder: './drizzle', migrationsSchema: 'members' })
}
