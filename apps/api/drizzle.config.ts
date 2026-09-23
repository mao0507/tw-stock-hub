import { defineConfig } from 'drizzle-kit'

// 只管 members schema；stocks 由 db/init/*.sql 管理
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/members.ts',
  out: './drizzle',
  schemaFilter: ['members'],
})
