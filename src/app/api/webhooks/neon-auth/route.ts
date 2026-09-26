import { jsonError } from '@/lib/api'
import { allowedDomains, isAllowedEmail } from '@/lib/auth/domains'
import { verifyNeonAuthWebhook } from '@/lib/auth/webhook'

export const runtime = 'nodejs'

interface NeonAuthEvent {
  event_type: string
  user?: { email?: string }
  event_data?: { auth_provider?: string }
}

/**
 * Neon Auth webhook (register it for `user.before_create`). Blocks sign-ups that aren't Google accounts on an
 * allowed domain before the user is written. Neon Auth fails closed: if this endpoint errors, the sign-up is refused.
 */
export async function POST(req: Request) {
  if (!process.env.NEON_AUTH_BASE_URL) return jsonError('Neon Auth is not configured', 503)
  const raw = await req.text()
  try {
    await verifyNeonAuthWebhook(raw, req.headers)
  } catch (e) {
    return jsonError(`Webhook rejected: ${(e as Error).message}`, 401)
  }

  const event = JSON.parse(raw) as NeonAuthEvent
  if (event.event_type !== 'user.before_create') return Response.json({ received: true })

  const email = event.user?.email
  const provider = event.event_data?.auth_provider
  if (provider === 'credential') {
    return Response.json({ allowed: false, error_code: 'google_only', error_message: 'Only Google sign-in is available.' })
  }
  if (!isAllowedEmail(email)) {
    return Response.json({
      allowed: false,
      error_code: 'email_domain_not_allowed',
      error_message: `${email ?? 'This account'} is not allowed. Sign in with an @${allowedDomains().join(' or @')} Google account.`,
    })
  }
  return Response.json({ allowed: true })
}
