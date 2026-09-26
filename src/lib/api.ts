import { authMode, getViewer, type Viewer } from '@/lib/auth/server'
import { timingSafeEqual } from 'node:crypto'

export const jsonError = (error: string, status: number, extra?: object) => Response.json({ error, ...extra }, { status })

export const apiKeyEnabled = () => Boolean(process.env.NAVPROBE_API_KEY)

export type Access = { kind: 'user'; viewer: Viewer; actor: string } | { kind: 'api-key'; actor: 'api-key' }

function providedKey(req: Request) {
  return req.headers.get('x-api-key') ?? req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
}

function keyMatches(provided: string) {
  const key = process.env.NAVPROBE_API_KEY
  if (!key) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(key)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Every API route calls this. Access is granted to:
 *  - programmatic clients carrying NAVPROBE_API_KEY (`Authorization: Bearer <key>` or `x-api-key`), or
 *  - users signed in with Neon Auth (Google) whose verified email is on an allowed domain (session cookie).
 * Returns a Response to send back when access is denied.
 */
export async function requireAccess(req: Request): Promise<Access | Response> {
  const key = providedKey(req)
  if (key !== null) {
    return keyMatches(key) ? { kind: 'api-key', actor: 'api-key' } : jsonError('Invalid API key', 401)
  }
  if (authMode() === 'misconfigured') {
    return jsonError('Sign-in is not configured on this deployment (NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required).', 503)
  }
  const viewer = await getViewer()
  if (!viewer) return jsonError('Sign in with an allowed Google account, or pass an API key as `Authorization: Bearer <key>`.', 401)
  return { kind: 'user', viewer, actor: viewer.email }
}

export const isDenied = (access: Access | Response): access is Response => access instanceof Response
