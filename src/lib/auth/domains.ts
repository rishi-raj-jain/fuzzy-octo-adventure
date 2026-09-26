/** Email domains allowed to sign in. Override with ALLOWED_EMAIL_DOMAINS="launchfa.st,neon.com". */
export function allowedDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS || 'launchfa.st,neon.com'
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

/** Exact domain match: `a@neon.com` is allowed, `a@neon.com.evil.dev` and `a@sub.neon.com` are not. */
export function isAllowedEmail(email: string | null | undefined, domains = allowedDomains()) {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at < 1) return false
  return domains.includes(
    email
      .slice(at + 1)
      .trim()
      .toLowerCase(),
  )
}
