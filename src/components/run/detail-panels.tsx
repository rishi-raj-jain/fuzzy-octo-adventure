'use client'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatBytes, formatMs, shortUrl } from '@/lib/format'
import type { ConsoleEntry, NavigationRecord, RequestEntry, StepResult } from '@/lib/scenario/schema'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'

export function FilmstripPanel({ steps, navigations }: { steps: StepResult[]; navigations: NavigationRecord[] }) {
  const frames = steps.flatMap((s) => s.frames.map((f) => ({ ...f, step: s.index, summary: s.summary })))
  if (!frames.length) return <p className="py-8 text-center text-sm text-muted-foreground">No frames recorded. Enable the filmstrip under Emulation.</p>
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">Frames are captured whenever pixels change on screen. Navigation starts are marked.</p>
      <div className="flex gap-2 overflow-x-auto pb-3">
        {frames.map((f, i) => {
          const prev = frames[i - 1]
          const nav = navigations.find((n) => n.startedAt <= f.t && (!prev || n.startedAt > prev.t))
          const newStep = !prev || prev.step !== f.step
          return (
            <div key={f.src} className="flex shrink-0 gap-2">
              {newStep && (
                <div className="flex w-5 shrink-0 flex-col items-center gap-1 pt-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{f.step + 1}</span>
                  <div className="w-px flex-1 bg-border" />
                </div>
              )}
              <figure className="grid w-36 gap-1">
                <a href={f.src} target="_blank" rel="noreferrer" className={cn('overflow-hidden rounded-md border bg-muted', nav && 'ring-2 ring-primary')}>
                  <img src={f.src} alt={`Frame at ${formatMs(f.t)}`} className="w-full" />
                </a>
                <figcaption className="grid text-[11px] leading-tight">
                  <span className="font-mono tabular-nums">{formatMs(f.t)}</span>
                  {nav && (
                    <span className="truncate text-primary">
                      {nav.kind === 'hard' ? 'Hard' : 'Soft'} nav → {shortUrl(nav.url)}
                    </span>
                  )}
                </figcaption>
              </figure>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const TYPE_COLORS: Record<string, string> = {
  Document: 'bg-sky-500',
  Script: 'bg-amber-500',
  Stylesheet: 'bg-violet-500',
  Image: 'bg-emerald-500',
  Font: 'bg-rose-500',
  Fetch: 'bg-cyan-600',
  XHR: 'bg-cyan-600',
}

export function WaterfallPanel({ requests, steps, navigations }: { requests: RequestEntry[]; steps: StepResult[]; navigations: NavigationRecord[] }) {
  const [filter, setFilter] = useState('')
  const [stepFilter, setStepFilter] = useState<number | null>(null)
  const visible = useMemo(
    () => requests.filter((r) => (stepFilter === null || r.stepIndex === stepFilter) && (!filter || r.url.toLowerCase().includes(filter.toLowerCase()) || r.resourceType.toLowerCase() === filter.toLowerCase())),
    [requests, filter, stepFilter],
  )
  const from = visible.length ? Math.min(...visible.map((r) => r.start)) : 0
  const to = visible.length ? Math.max(...visible.map((r) => r.end ?? r.responseAt ?? r.start)) : 1
  const span = Math.max(to - from, 1)
  const pct = (t: number) => `${((t - from) / span) * 100}%`
  const shown = visible.slice(0, 600)

  if (!requests.length) return <p className="py-8 text-center text-sm text-muted-foreground">No requests recorded yet.</p>
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 max-w-64" placeholder="Filter by URL or type (Script, Image…)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          <Badge variant={stepFilter === null ? 'default' : 'outline'} render={<button type="button" onClick={() => setStepFilter(null)} />}>
            All steps
          </Badge>
          {steps
            .filter((s) => s.metrics.requests > 0)
            .map((s) => (
              <Badge key={s.index} variant={stepFilter === s.index ? 'default' : 'outline'} render={<button type="button" onClick={() => setStepFilter(s.index)} />}>
                Step {s.index + 1} · {s.metrics.requests}
              </Badge>
            ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} requests · {formatBytes(visible.reduce((s, r) => s + (r.bytes ?? 0), 0))}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(0,2.2fr)_48px_64px_minmax(0,3fr)] gap-2 border-b bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>URL</span>
            <span>Status</span>
            <span className="text-right">Size</span>
            <span className="flex justify-between">
              <span>{formatMs(from)}</span>
              <span>{formatMs(to)}</span>
            </span>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {shown.map((r) => {
              const end = r.end ?? r.responseAt ?? r.start
              const color = TYPE_COLORS[r.resourceType] ?? 'bg-slate-400'
              return (
                <div key={r.id} className="grid grid-cols-[minmax(0,2.2fr)_48px_64px_minmax(0,3fr)] items-center gap-2 border-b px-3 py-1 text-[11px] last:border-b-0 hover:bg-muted/40">
                  <span className="truncate font-mono" title={`${r.method} ${r.url}\n${r.resourceType}${r.protocol ? ` · ${r.protocol}` : ''}${r.mimeType ? ` · ${r.mimeType}` : ''}`}>
                    {shortUrl(r.url)}
                  </span>
                  <span className={cn('font-mono', (r.failed || (r.status ?? 0) >= 400) && 'text-destructive')} title={r.failed}>
                    {r.failed ? 'ERR' : (r.status ?? '…')}
                  </span>
                  <span className="text-right font-mono text-muted-foreground tabular-nums">{r.fromCache ? 'cache' : r.bytes !== undefined ? formatBytes(r.bytes) : ''}</span>
                  <span className="relative h-3.5">
                    {navigations.map((n) => (n.startedAt >= from && n.startedAt <= to ? <span key={n.id} className="absolute inset-y-0 w-px bg-primary/40" style={{ left: pct(n.startedAt) }} /> : null))}
                    <span className={cn('absolute inset-y-0.5 rounded-sm opacity-40', color)} style={{ left: pct(r.start), width: `max(2px, calc(${pct(r.responseAt ?? end)} - ${pct(r.start)}))` }} />
                    {r.responseAt !== undefined && <span className={cn('absolute inset-y-0.5 rounded-sm', color)} style={{ left: pct(r.responseAt), width: `max(2px, calc(${pct(end)} - ${pct(r.responseAt)}))` }} />}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Light segment: waiting for the response · solid segment: downloading · vertical lines: navigation starts.{visible.length > shown.length && ` Showing the first ${shown.length}.`}
      </p>
    </div>
  )
}

const LEVEL_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = { error: 'destructive', pageerror: 'destructive', warn: 'secondary', warning: 'secondary' }

export function ConsolePanel({ entries }: { entries: ConsoleEntry[] }) {
  if (!entries.length) return <p className="py-8 text-center text-sm text-muted-foreground">The page didn&apos;t log anything.</p>
  return (
    <div className="overflow-hidden rounded-lg border">
      {entries.map((e, i) => (
        <div key={i} className="grid grid-cols-[64px_72px_40px_minmax(0,1fr)] items-start gap-2 border-b px-3 py-1.5 text-xs last:border-b-0">
          <span className="font-mono text-muted-foreground tabular-nums">{formatMs(e.t)}</span>
          <Badge variant={LEVEL_VARIANT[e.level] ?? 'outline'}>{e.level}</Badge>
          <span className="font-mono text-muted-foreground">#{e.stepIndex + 1}</span>
          <span className="font-mono break-words whitespace-pre-wrap">{e.text}</span>
        </div>
      ))}
    </div>
  )
}
