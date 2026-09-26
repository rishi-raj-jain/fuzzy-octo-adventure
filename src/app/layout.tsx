import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UserMenu } from '@/components/user-menu'
import { authMode } from '@/lib/auth/server'
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'NavProbe — scripted navigation & Web Vitals testing',
  description: 'Load a page in a remote Chromium, script what happens next, and measure Web Vitals for every hard and soft navigation.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-background">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <header className="sticky top-0 z-40 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/70">
              <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
                <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
                  <Logo />
                  NavProbe
                </Link>
                <span className="hidden truncate text-sm text-muted-foreground lg:inline">Scripted navigation &amp; Web Vitals testing</span>
                <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
                  <a href="/api/health" className="hidden px-2 text-xs text-muted-foreground hover:text-foreground sm:inline" target="_blank" rel="noreferrer">
                    API
                  </a>
                  <UserMenu mode={authMode()} />
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6">{children}</main>
            <Toaster richColors position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
