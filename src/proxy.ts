import { authMode, getAuth } from '@/lib/auth/server'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Pages require a Neon Auth session. The Neon Auth middleware also completes the Google OAuth round-trip
 * (it exchanges the `neon_auth_session_verifier` for a session cookie) and refreshes sessions.
 * The email-domain allowlist is enforced by the (app) layout and every API route.
 */
export async function proxy(req: NextRequest) {
  const mode = authMode()
  if (mode === 'disabled') return NextResponse.next()
  const next = req.nextUrl.pathname + req.nextUrl.search
  const login = new URL('/login', req.url)
  if (next !== '/') login.searchParams.set('next', next)
  if (mode === 'misconfigured') return NextResponse.redirect(login)

  const res = await getAuth().middleware({ loginUrl: '/login' })(req)
  // Signed out: the SDK redirects to /login copying the query string; send the original path as `next` instead.
  const location = res.headers.get('location')
  if (location && new URL(location, req.url).pathname === '/login') {
    const redirect = NextResponse.redirect(login)
    for (const cookie of res.headers.getSetCookie()) redirect.headers.append('set-cookie', cookie)
    return redirect
  }
  return res
}

export const config = {
  matcher: ['/((?!api/|login|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)'],
}
