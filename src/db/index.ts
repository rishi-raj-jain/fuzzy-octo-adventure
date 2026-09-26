import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export const hasDatabase = () => Boolean(process.env.DATABASE_URL)

let client: ReturnType<typeof createClient> | undefined
const createClient = () => drizzle({ client: neon(process.env.DATABASE_URL!), schema })

export function getDb() {
  if (!hasDatabase()) throw new Error('DATABASE_URL is not configured')
  return (client ??= createClient())
}

export * from './schema'
