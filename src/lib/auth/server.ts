import { createNeonAuth } from '@neondatabase/auth/next/server'
import { isAllowedEmail } from './domains'

export type AuthMode = 'neon' | 'disabled' | 'misconfigured'

/**
 * neon          – Neon Auth is configured and enforced (Google sign-in only).
 * disabled      – local development without Neon Auth settings: everything is open (a banner says so).
 * misconfigured – production without settings: fail closed, nothing is accessible.
 */
export function authMode(): AuthMode {
  const configured = Boolean(process.env.NEON_AUTH_BASE_URL && (process.env.NEON_AUTH_COOKIE_SECRET?.length ?? 0) >= 32)
  if (configured) return 'neon'
  return process.env.NODE_ENV === 'development' ? 'disabled' : 'misconfigured'
}

function createAuth() {
  return createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  })
}

let instance: ReturnType<typeof createAuth> | undefined
/** Lazily created so builds and unconfigured environments never need the secrets. */
export function getAuth() {
  return (instance ??= createAuth())
}

export interface Viewer {
  id: string
  email: string
  name: string
  image?: string | null
}

export type ViewerResult = { viewer: Viewer } | { viewer: null; reason: 'signed-out' | 'not-allowed' | 'misconfigured' }

const DEV_VIEWER: Viewer = { id: 'dev', email: 'dev@localhost', name: 'Local developer' }

/**
 * The signed-in user for the current request (Route Handlers, Server Components, Server Actions).
 * A session only counts when its email is verified and on an allowed domain: Neon Auth manages sign-in,
 * the allowlist is enforced here (and at sign-up by the user.before_create webhook).
 */
export async function resolveViewer(): Promise<ViewerResult> {
  const mode = authMode()
  if (mode === 'disabled') return { viewer: DEV_VIEWER }
  if (mode === 'misconfigured') return { viewer: null, reason: 'misconfigured' }
  const { data } = await getAuth()
    .getSession()
    .catch(() => ({ data: null }))
  const user = data?.user
  if (!user) return { viewer: null, reason: 'signed-out' }
  if (!user.emailVerified || !isAllowedEmail(user.email)) return { viewer: null, reason: 'not-allowed' }
  return { viewer: { id: user.id, email: user.email, name: user.name, image: user.image } }
}

export async function getViewer(): Promise<Viewer | null> {
  return (await resolveViewer()).viewer
}
