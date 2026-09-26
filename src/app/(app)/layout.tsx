import { resolveViewer } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

// Reads the session cookie on every request.
export const dynamic = 'force-dynamic'

/**
 * Every app page is rendered for an allowed user only. proxy.ts has already sent signed-out visitors to /login;
 * this catches signed-in accounts outside the allowed domains (or with unverified emails).
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const result = await resolveViewer()
  if (!result.viewer) redirect(result.reason === 'not-allowed' ? '/login?error=email_domain_not_allowed' : '/login')
  return children
}
