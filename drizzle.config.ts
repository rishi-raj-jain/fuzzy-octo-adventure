import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env.local', '.env'], quiet: true })

export default defineConfig({
  schema: './src/db/schema.ts',
  // Neon Auth keeps users and sessions in its own `neon_auth` schema; Drizzle only manages `public`.
  schemaFilter: ['public'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
