'use client'

import { RunHistory } from '@/components/run-history'
import { RunView } from '@/components/run/run-view'
import { ScenarioBuilder } from '@/components/scenario/scenario-builder'
import { Card, CardContent } from '@/components/ui/card'
import { useHealth } from '@/hooks/use-health'
import { useRun } from '@/hooks/use-run'
import { apiFetch } from '@/lib/api-client'
import { decodeDraft, defaultDraft, fromRequest, toRequest, type Draft } from '@/lib/draft'
import { runInputSchema } from '@/lib/scenario/schema'
import { Activity, Film, Gauge, MousePointerClick } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const STORAGE_KEY = 'navprobe:draft'

function loadInitialDraft(): Draft {
  if (typeof window === 'undefined') return defaultDraft()
  const shared = window.location.hash.match(/#s=([\w-]+)/)?.[1]
  if (shared) {
    const decoded = decodeDraft(shared)
    if (decoded) return decoded
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return fromRequest(JSON.parse(saved))
  } catch {}
  return defaultDraft()
}

function EmptyState() {
  const items = [
    { icon: MousePointerClick, title: 'Script real journeys', text: 'Wait, click, type, or run any JavaScript in the page — exactly like a user or the DevTools console would.' },
    { icon: Gauge, title: 'Vitals for every navigation', text: 'TTFB, FCP, LCP, CLS, INP and blocking time for the initial load, full page loads, and client-side route changes.' },
    { icon: Film, title: 'See what users saw', text: 'Screenshots after each step, a filmstrip of every visual change, and a request waterfall.' },
  ]
  return (
    <Card className="border-dashed bg-transparent shadow-none">
      <CardContent className="grid gap-5 py-5 sm:gap-6 sm:py-6">
        <div className="grid gap-1">
          <h2 className="flex items-center gap-2 font-medium">
            <Activity className="size-4" /> Test how navigation feels on any site
          </h2>
          <p className="text-sm text-muted-foreground">Enter a URL, describe what should happen after the page loads, and run it in a real Chromium in the cloud.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {items.map(({ icon: Icon, title, text }) => (
            <div key={title} className="grid content-start gap-1.5">
              <Icon className="size-5 text-muted-foreground" />
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function NavProbeApp() {
  const [draft, setDraft] = useState<Draft>(defaultDraft)
  const [hydrated, setHydrated] = useState(false)
  const health = useHealth()
  const { run, start, cancel } = useRun()
  const [historyKey, setHistoryKey] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()
  const fromRun = searchParams.get('from')

  // Client-only initial state (share links in the hash, last draft in localStorage).
  useEffect(() => {
    setDraft(loadInitialDraft())
    setHydrated(true)
  }, [])

  // "Edit & re-run" from a stored run.
  useEffect(() => {
    if (!fromRun) return
    apiFetch(`/api/runs/${fromRun}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((r) => setDraft(fromRequest(r.input)))
      .catch(() => toast.error('Could not load that run'))
  }, [fromRun])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toRequest(draft)))
    } catch {}
  }, [draft, hydrated])

  useEffect(() => {
    if (run && !run.running) setHistoryKey((k) => k + 1)
  }, [run?.running])

  const onRun = () => {
    const request = toRequest(draft)
    const parsed = runInputSchema.safeParse(request)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue.path[0] === 'steps' && typeof issue.path[1] === 'number' ? `Step ${issue.path[1] + 2}: ` : issue.path[0] === 'url' ? 'URL: ' : ''
      toast.error(`${where}${issue.message}`)
      return
    }
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
    void start(request)
    // Single-column layouts: bring the live results into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      {/* On large screens the builder scrolls independently so the Run button never leaves the viewport. */}
      <div className="[scrollbar-width:thin] lg:sticky lg:top-20 lg:-m-1 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:p-1">
        <ScenarioBuilder draft={draft} onChange={setDraft} onRun={onRun} onCancel={cancel} running={Boolean(run?.running)} apiKeyEnabled={health?.auth.apiKey ?? false} regions={health?.regions} />
        {health && (
          <p className="mt-2 px-1 text-[11px] text-muted-foreground">
            Runs are limited to {health.limits.maxRunSeconds}s and {health.limits.maxSteps} steps.
          </p>
        )}
      </div>
      <div ref={resultsRef} className="grid min-w-0 scroll-mt-20 gap-4 sm:gap-6">
        {run ? <RunView run={run} /> : <EmptyState />}
        <RunHistory refreshKey={historyKey} persistence={health?.persistence ?? false} authMode={health?.auth.mode} />
      </div>
    </div>
  )
}
