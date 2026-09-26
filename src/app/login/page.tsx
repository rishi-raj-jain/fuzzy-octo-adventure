import { LoginCard } from '@/components/login-card'
import { allowedDomains } from '@/lib/auth/domains'
import { authMode, getViewer } from '@/lib/auth/server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Sign in — NavProbe' }

/** Only same-origin paths, never protocol-relative URLs (open redirect). */
function safeNext(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/'
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = safeNext(params.next)
  const mode = authMode()
  if (mode !== 'misconfigured' && (await getViewer(await headers()))) redirect(next)

  const error = typeof params.error === 'string' ? params.error : undefined
  const description = typeof params.error_description === 'string' ? params.error_description : undefined
  return (
    <div className="flex min-h-[calc(100dvh-10rem)] items-center justify-center py-6">
      <LoginCard mode={mode} next={next} domains={allowedDomains()} error={error} errorDescription={description} />
    </div>
  )
}
