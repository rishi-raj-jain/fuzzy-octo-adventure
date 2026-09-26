'use client'

import { STEP_ICONS } from '@/components/scenario/step-editor'
import { Badge } from '@/components/ui/badge'
import { formatBytes, formatMs, shortUrl } from '@/lib/format'
import type { StepResult } from '@/lib/scenario/schema'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, CircleDashed, CircleSlash, Loader2 } from 'lucide-react'

export function StepStatusIcon({ status, active }: { status?: StepResult['status']; active?: boolean }) {
  if (active) return <Loader2 className="size-4 animate-spin text-primary" />
  if (status === 'ok') return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
  if (status === 'error') return <AlertCircle className="size-4 text-destructive" />
  if (status === 'skipped') return <CircleSlash className="size-4 text-muted-foreground" />
  return <CircleDashed className="size-4 text-muted-foreground/60" />
}

export function StepTimeline({ plan, steps, activeStep }: { plan: string[]; steps: StepResult[]; activeStep?: number }) {
  return (
    <ol className="grid gap-1">
      {plan.map((summary, i) => {
        const result = steps.find((s) => s.index === i)
        return (
          <li key={i} className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-sm', activeStep === i && 'bg-muted')}>
            <StepStatusIcon status={result?.status} active={activeStep === i && !result} />
            <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
            <span className={cn('min-w-0 flex-1 truncate', !result && activeStep !== i && 'text-muted-foreground')}>{summary}</span>
            {result && result.status !== 'skipped' && <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatMs(result.durationMs)}</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </div>
  )
}

export function StepsPanel({ steps }: { steps: StepResult[] }) {
  if (!steps.length) return <p className="py-8 text-center text-sm text-muted-foreground">No steps have finished yet.</p>
  return (
    <div className="grid gap-3">
      {steps.map((step) => {
        const Icon = STEP_ICONS[step.type]
        return (
          <div key={step.index} className={cn('@container min-w-0 overflow-hidden rounded-lg border bg-card', step.status === 'error' && 'border-destructive/50')}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2.5">
              <StepStatusIcon status={step.status} />
              <span className="font-mono text-xs text-muted-foreground">{step.index + 1}</span>
              <Icon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 basis-32 truncate text-sm font-medium" title={step.summary}>
                {step.summary}
              </span>
              <span className="ml-auto font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                +{formatMs(step.startedAt)} · {formatMs(step.durationMs)}
              </span>
            </div>
            {step.status !== 'skipped' && (
              <div className="grid gap-3 p-3 @2xl:grid-cols-[minmax(0,1fr)_240px]">
                <div className="grid min-w-0 content-start gap-3">
                  {step.error && <p className="rounded-md bg-destructive/10 px-2.5 py-2 font-mono text-xs break-words text-destructive">{step.error}</p>}
                  {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                  <div className="grid grid-cols-2 gap-3 @sm:grid-cols-3 @3xl:grid-cols-6">
                    <Metric label="Requests" value={String(step.metrics.requests)} />
                    <Metric label="Transferred" value={formatBytes(step.metrics.bytes)} />
                    <Metric label="Failed" value={String(step.metrics.failedRequests)} />
                    <Metric label="Network settled" value={formatMs(step.metrics.networkSettled)} />
                    <Metric label="First visual change" value={formatMs(step.metrics.firstVisualChange)} />
                    <Metric label="Last visual change" value={formatMs(step.metrics.lastVisualChange)} />
                  </div>
                  {step.urlChanges.length > 0 && (
                    <div className="grid gap-1">
                      <span className="text-[11px] text-muted-foreground">URL changes</span>
                      {step.urlChanges.map((c, i) => (
                        <div key={i} className="flex min-w-0 items-center gap-2 text-xs">
                          <Badge variant={c.kind === 'document' ? 'default' : 'secondary'}>{c.kind === 'document' ? 'document' : 'history'}</Badge>
                          <span className="font-mono text-muted-foreground tabular-nums">+{formatMs(c.t)}</span>
                          <span className="truncate" title={c.url}>
                            {shortUrl(c.url)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {step.returnValue !== undefined && (
                    <div className="grid gap-1">
                      <span className="text-[11px] text-muted-foreground">Return value</span>
                      <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px]">{JSON.stringify(step.returnValue, null, 2)}</pre>
                    </div>
                  )}
                  {step.urlAfter && (
                    <p className="truncate text-xs text-muted-foreground" title={step.urlAfter}>
                      Ended on {shortUrl(step.urlAfter)}
                    </p>
                  )}
                </div>
                {step.screenshot && (
                  <a href={step.screenshot} target="_blank" rel="noreferrer" className="order-first block self-start overflow-hidden rounded-md border bg-muted @2xl:order-none">
                    <img src={step.screenshot} alt={`Screenshot after step ${step.index + 1}`} className="w-full" loading="lazy" />
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
