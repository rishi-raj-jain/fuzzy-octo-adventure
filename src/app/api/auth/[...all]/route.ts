import { jsonError } from '@/lib/api'
import { authMode, getAuth } from '@/lib/auth/server'

export const runtime = 'nodejs'

/**
 * Proxies the browser's auth calls to Neon Auth. Only what Google sign-in needs is exposed: email/password,
 * magic links, OTPs, account linking etc. are refused here even if they are enabled in the Neon Console.
 */
const ALLOWED = new Set(['get-session', 'sign-in/social', 'sign-out', 'token'])

async function handle(req: Request, ctx: RouteContext<'/api/auth/[...all]'>) {
  if (authMode() !== 'neon') return jsonError('Sign-in is not configured', 503)
  const { all } = await ctx.params
  const path = all.join('/')
  if (!ALLOWED.has(path)) return jsonError('Only Google sign-in is available', 404)
  if (path === 'sign-in/social') {
    const body = await req
      .clone()
      .json()
      .catch(() => ({}))
    if (body?.provider !== 'google') return jsonError('Only Google sign-in is available', 400)
  }
  const handlers = getAuth().handler()
  const method = req.method as keyof typeof handlers
  const handler = handlers[method]
  if (!handler) return jsonError('Method not allowed', 405)
  return handler(req, { params: Promise.resolve({ path: all }) })
}

export const GET = handle
export const POST = handle
