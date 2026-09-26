import { LoginCard } from '@/components/login-card'
import { allowedDomains } from '@/lib/auth/domains'
import { authMode, resolveViewer } from '@/lib/auth/server'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

// Reads the session cookie on every request.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Sign in — NavProbe' }

/** Only same-origin paths, never protocol-relative URLs (open redirect). */
function safeNext(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/'
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = safeNext(params.next)
  const mode = authMode()
  const result = await resolveViewer()
  if (result.viewer && mode !== 'disabled') redirect(next)

  // A signed-in account that isn't allowed is shown the domain error (and signed out by the card).
  const rejected = !result.viewer && (result.reason === 'not-allowed' || result.reason === 'unverified')
  const rejectedCode = !result.viewer && result.reason === 'unverified' ? 'email_not_verified' : 'email_domain_not_allowed'
  const error = rejected ? rejectedCode : typeof params.error === 'string' ? params.error : undefined
  const description = typeof params.error_description === 'string' ? params.error_description : undefined
  return (
    <div className="flex min-h-[calc(100dvh-10rem)] items-center justify-center py-6">
      <LoginCard mode={mode} next={next} domains={allowedDomains()} error={error} errorDescription={description} signOutFirst={rejected} />
    </div>
  )
}
