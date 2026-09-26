'use client'

import { ConsolePanel, FilmstripPanel, WaterfallPanel } from '@/components/run/detail-panels'
import { NavigationsPanel } from '@/components/run/navigations-panel'
import { StepsPanel, StepTimeline } from '@/components/run/steps-panel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { LiveRun } from '@/hooks/use-run'
import { formatBytes, formatMs, shortUrl } from '@/lib/format'
import { DEVICES, NETWORKS, type RunSummary } from '@/lib/scenario/schema'
import { cn } from '@/lib/utils'
import { AlertTriangle, Download, ExternalLink, Loader2 } from 'lucide-react'
import Link from 'next/link'

export function liveFromSummary(summary: RunSummary): LiveRun {
  return { id: summary.id, url: summary.url, startedAt: summary.startedAt, plan: summary.steps.map((s) => s.summary), steps: summary.steps, navigations: summary.navigations, result: summary, running: false }
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ok: { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  error: { label: 'Failed', className: 'bg-destructive/15 text-destructive' },
  timeout: { label: 'Timed out', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  aborted: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
}

function Stat({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium tabular-nums', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

export function RunView({ run, showPermalink = true }: { run: LiveRun; showPermalink?: boolean }) {
  const result = run.result
  const status = run.running ? null : result ? STATUS_BADGE[result.status] : run.error ? STATUS_BADGE.error : null
  const requests = result?.requests ?? []
  const hard = run.navigations.filter((n) => n.kind === 'hard').length
  const soft = run.navigations.length - hard

  const download = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `navprobe-${result.id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            {run.running ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : status && <Badge className={status.className}>{status.label}</Badge>}
            <span className="truncate" title={run.url}>
              {result?.title || shortUrl(run.url)}
            </span>
          </CardTitle>
          <CardDescription className="truncate">
            {shortUrl(run.url)}
            {result?.finalUrl && result.finalUrl !== run.url && <> → {shortUrl(result.finalUrl)}</>}
          </CardDescription>
          <CardAction className="flex gap-1.5">
            {result?.persisted && showPermalink && (
              <Link href={`/runs/${result.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <ExternalLink /> Permalink
              </Link>
            )}
            {result && (
              <button type="button" onClick={download} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Download /> JSON
              </button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          {(run.error || result?.error) && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{result?.status === 'timeout' ? 'The run hit its time limit' : 'The run did not complete'}</AlertTitle>
              <AlertDescription className="break-words">{result?.error ?? run.error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Duration" value={result ? formatMs(result.durationMs) : '…'} />
            <Stat mono={false} label="Navigations" value={`${hard} hard · ${soft} soft`} />
            <Stat label="Requests" value={result ? String(result.totals.requests) : String(run.steps.reduce((s, x) => s + x.metrics.requests, 0))} />
            <Stat label="Transferred" value={formatBytes(result ? result.totals.bytes : run.steps.reduce((s, x) => s + x.metrics.bytes, 0))} />
            <Stat mono={false} label="Device" value={result ? DEVICES[result.options.device].label.split(' · ')[0] : '…'} />
            <Stat mono={false} label="Network" value={result ? NETWORKS[result.options.network] : '…'} />
          </div>
          {run.running && run.plan.length > 0 && <StepTimeline plan={run.plan} steps={run.steps} activeStep={run.activeStep} />}
          {result?.browserVersion && (
            <p className="text-[11px] text-muted-foreground">
              {result.browserVersion} · started {new Date(result.startedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="navigations">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="navigations">
            Navigations <span className="text-muted-foreground">{run.navigations.length}</span>
          </TabsTrigger>
          <TabsTrigger value="steps">
            Steps <span className="text-muted-foreground">{run.steps.length}</span>
          </TabsTrigger>
          <TabsTrigger value="filmstrip">Filmstrip</TabsTrigger>
          <TabsTrigger value="waterfall">
            Waterfall <span className="text-muted-foreground">{requests.length || ''}</span>
          </TabsTrigger>
          <TabsTrigger value="console">
            Console <span className={cn('text-muted-foreground', result?.console.some((c) => c.level === 'error' || c.level === 'pageerror') && 'text-destructive')}>{result?.console.length || ''}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="navigations" className="pt-2">
          <NavigationsPanel navigations={run.navigations} running={run.running} />
        </TabsContent>
        <TabsContent value="steps" className="pt-2">
          <StepsPanel steps={run.steps} />
        </TabsContent>
        <TabsContent value="filmstrip" className="pt-2">
          <FilmstripPanel steps={run.steps} navigations={run.navigations} />
        </TabsContent>
        <TabsContent value="waterfall" className="pt-2">
          {result ? (
            <WaterfallPanel requests={requests} steps={run.steps} navigations={run.navigations} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">The waterfall is available when the run finishes.</p>
          )}
        </TabsContent>
        <TabsContent value="console" className="pt-2">
          {result ? <ConsolePanel entries={result.console} /> : <p className="py-8 text-center text-sm text-muted-foreground">Console output is available when the run finishes.</p>}
        </TabsContent>
      </Tabs>
    </div>
  )
}
