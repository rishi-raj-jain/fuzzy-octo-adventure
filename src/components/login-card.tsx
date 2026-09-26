'use client'

import { Logo } from '@/components/logo'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth/client'
import type { AuthMode } from '@/lib/auth/server'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function errorText(code: string, description: string | undefined, domains: string[]) {
  const list = domains.map((d) => `@${d}`).join(' or ')
  switch (code) {
    case 'email_domain_not_allowed':
    case 'DOMAIN_BLOCKED':
      return { title: 'This Google account isn’t allowed', body: description ?? `Only ${list} accounts can sign in.` }
    case 'google_only':
      return { title: 'Use Google to sign in', body: 'Only Google sign-in is available.' }
    case 'access_denied':
      return { title: 'Sign-in was cancelled', body: 'Google sign-in was cancelled before it finished.' }
    case 'email_not_verified':
      return { title: 'Email not verified', body: 'Your Google account’s email address must be verified to use NavProbe.' }
    default: {
      // Errors raised during Neon Auth's OAuth callback (e.g. a webhook denial) arrive as the message with spaces
      // turned into underscores: show them as sentences rather than codes.
      const text = code.replace(/_/g, ' ').trim()
      if (/\bnot allowed\b/i.test(text)) return { title: 'This Google account isn’t allowed', body: text }
      if (/\s/.test(text)) return { title: 'Sign-in failed', body: description ?? text }
      return { title: 'Sign-in failed', body: description ?? `Something went wrong (${text}). Please try again.` }
    }
  }
}

export function LoginCard({ mode, next, domains, error, errorDescription, signOutFirst }: { mode: AuthMode; next: string; domains: string[]; error?: string; errorDescription?: string; signOutFirst?: boolean }) {
  const [pending, setPending] = useState(false)
  const [clientError, setClientError] = useState<string>()
  const failure = error ? errorText(error, errorDescription, domains) : undefined

  // An account outside the allowed domains is signed in with Neon Auth but useless here: clear it so
  // the next attempt can use a different Google account.
  useEffect(() => {
    if (signOutFirst) void authClient.signOut()
  }, [signOutFirst])

  const signIn = async () => {
    setPending(true)
    setClientError(undefined)
    const origin = window.location.origin
    // Absolute URLs: Neon Auth runs on its own domain and redirects back here. Keep share links (#s=…).
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: `${origin}${next}${window.location.hash}`,
      errorCallbackURL: `${origin}/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`,
    })
    if (error) {
      setClientError(error.message ?? 'Could not start Google sign-in')
      setPending(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="justify-items-center text-center">
        <Logo className="mb-2 size-10 rounded-lg" />
        <CardTitle className="text-lg">Sign in to NavProbe</CardTitle>
        <CardDescription>Scripted navigation &amp; Web Vitals testing</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {failure && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{failure.title}</AlertTitle>
            <AlertDescription className="break-words">{failure.body}</AlertDescription>
          </Alert>
        )}
        {clientError && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{clientError}</AlertDescription>
          </Alert>
        )}
        {mode === 'misconfigured' ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>Sign-in isn&apos;t configured</AlertTitle>
            <AlertDescription>
              Set <code>NEON_AUTH_BASE_URL</code> and <code>NEON_AUTH_COOKIE_SECRET</code> on this deployment.
            </AlertDescription>
          </Alert>
        ) : mode === 'disabled' ? (
          <Link href={next} className={buttonVariants({ size: 'lg', className: 'h-11 w-full' })}>
            Continue (auth is off in local dev)
          </Link>
        ) : (
          <Button size="lg" variant="outline" className="h-11 w-full text-sm" onClick={signIn} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </Button>
        )}
      </CardContent>
      <CardFooter className="justify-center border-t">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Access is limited to{' '}
            {domains.map((d, i) => (
              <span key={d}>
                {i > 0 && (i === domains.length - 1 ? ' and ' : ', ')}
                <b className="font-medium text-foreground">@{d}</b>
              </span>
            ))}{' '}
            Google accounts.
          </span>
        </p>
      </CardFooter>
    </Card>
  )
}
