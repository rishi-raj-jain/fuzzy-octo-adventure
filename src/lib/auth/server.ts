import { getDb, hasDatabase } from '@/db'
import * as schema from '@/db/auth-schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { allowedDomains, isAllowedEmail } from './domains'

export type AuthMode = 'google' | 'disabled' | 'misconfigured'

/**
 * google        – Google sign-in is configured and enforced.
 * disabled      – local development without Google credentials: everything is open (a banner says so).
 * misconfigured – production without credentials: fail closed, nothing is accessible.
 */
export function authMode(): AuthMode {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.BETTER_AUTH_SECRET && hasDatabase())
  if (configured) return 'google'
  return process.env.NODE_ENV === 'development' ? 'disabled' : 'misconfigured'
}

const domainError = (email?: string | null) =>
  new APIError('FORBIDDEN', {
    code: 'email_domain_not_allowed',
    message: `${email ?? 'This account'} is not allowed. Sign in with an @${allowedDomains().join(' or @')} Google account.`,
  })

function createAuth() {
  const productionUrl = process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined
  return betterAuth({
    appName: 'NavProbe',
    baseURL: process.env.BETTER_AUTH_URL || productionUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: 'select_account',
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Signed cookie cache: avoids a database round-trip on most requests (revocations apply within 5 minutes).
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    onAPIError: { errorURL: '/login' },
    databaseHooks: {
      user: {
        create: {
          // New accounts: only verified emails on an allowed domain.
          before: async (user) => {
            if (!isAllowedEmail(user.email) || !user.emailVerified) throw domainError(user.email)
            return { data: user }
          },
        },
      },
      session: {
        create: {
          // Every sign-in re-checks the domain, so removing a domain from the allowlist locks those users out.
          before: async (session) => {
            const [user] = await getDb().select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, session.userId)).limit(1)
            if (!user || !isAllowedEmail(user.email)) throw domainError(user?.email)
            return { data: session }
          },
        },
      },
    },
  })
}

let instance: ReturnType<typeof createAuth> | undefined
/** Lazily created so builds and unauthenticated environments never need the database or secrets. */
export function getAuth() {
  return (instance ??= createAuth())
}

export interface Viewer {
  id: string
  email: string
  name: string
  image?: string | null
}

const DEV_VIEWER: Viewer = { id: 'dev', email: 'dev@localhost', name: 'Local developer' }

/** The signed-in user for these request headers, or null. In `disabled` mode everyone is a local developer. */
export async function getViewer(headers: Headers): Promise<Viewer | null> {
  const mode = authMode()
  if (mode === 'disabled') return DEV_VIEWER
  if (mode === 'misconfigured') return null
  const session = await getAuth()
    .api.getSession({ headers })
    .catch(() => null)
  if (!session || !isAllowedEmail(session.user.email)) return null
  return { id: session.user.id, email: session.user.email, name: session.user.name, image: session.user.image }
}
