import { ThemeToggle } from '@/components/theme-toggle'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Metadata } from 'next'
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <header className="border-b">
              <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
                <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                  <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 12h4l3 8 4-16 3 8h4" />
                    </svg>
                  </span>
                  NavProbe
                </Link>
                <span className="hidden text-sm text-muted-foreground sm:inline">Scripted navigation &amp; Web Vitals testing</span>
                <div className="ml-auto flex items-center gap-1">
                  <a href="/api/health" className="text-xs text-muted-foreground hover:text-foreground" target="_blank" rel="noreferrer">
                    API
                  </a>
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
            <Toaster richColors />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
