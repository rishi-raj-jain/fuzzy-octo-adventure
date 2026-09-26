import { authMode, getViewer } from '@/lib/auth/server'
import { NextResponse, type NextRequest } from 'next/server'

/** Pages require a signed-in, allowed user. API routes enforce access themselves (they also accept API keys). */
export async function proxy(req: NextRequest) {
  const mode = authMode()
  if (mode === 'disabled') return NextResponse.next()
  if (mode === 'google' && (await getViewer(req.headers))) return NextResponse.next()
  const login = new URL('/login', req.url)
  const next = req.nextUrl.pathname + req.nextUrl.search
  if (next !== '/') login.searchParams.set('next', next)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!api/|login|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)'],
}
