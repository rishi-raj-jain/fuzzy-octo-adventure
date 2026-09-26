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
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 sm:mx-0 sm:px-0">
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
              <figure className="grid w-28 snap-start gap-1 sm:w-36">
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
  const stepsWithRequests = steps.filter((s) => s.metrics.requests > 0)
  const chip = (active: boolean) => cn('shrink-0 pointer-coarse:h-7 pointer-coarse:px-2.5', !active && 'text-muted-foreground')

  return (
    <div className="@container grid min-w-0 gap-3">
      <div className="grid gap-2 @xl:flex @xl:flex-wrap @xl:items-center">
        <Input className="h-9 w-full @xl:h-8 @xl:max-w-64" placeholder="Filter by URL or type (Script, Image…)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="-mx-1 flex [scrollbar-width:none] gap-1 overflow-x-auto px-1 pb-0.5 [&::-webkit-scrollbar]:hidden">
          <Badge variant={stepFilter === null ? 'default' : 'outline'} className={chip(stepFilter === null)} render={<button type="button" onClick={() => setStepFilter(null)} />}>
            All steps
          </Badge>
          {stepsWithRequests.map((s) => (
            <Badge key={s.index} variant={stepFilter === s.index ? 'default' : 'outline'} className={chip(stepFilter === s.index)} render={<button type="button" onClick={() => setStepFilter(s.index)} />}>
              Step {s.index + 1} · {s.metrics.requests}
            </Badge>
          ))}
        </div>
        <span className="text-xs text-muted-foreground @xl:ml-auto">
          {visible.length} requests · {formatBytes(visible.reduce((s, r) => s + (r.bytes ?? 0), 0))}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        {/* Wide panels: one line per request. Narrow panels: name/status/size on top, timing bar underneath. */}
        <div className="hidden grid-cols-[minmax(0,2.2fr)_48px_64px_minmax(0,3fr)] gap-2 border-b bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground @2xl:grid">
          <span>URL</span>
          <span>Status</span>
          <span className="text-right">Size</span>
          <span className="flex justify-between">
            <span>{formatMs(from)}</span>
            <span>{formatMs(to)}</span>
          </span>
        </div>
        <div className="flex justify-between border-b bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground @2xl:hidden">
          <span>Timeline {formatMs(from)}</span>
          <span>{formatMs(to)}</span>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto overscroll-contain @2xl:max-h-[560px]">
          {shown.map((r) => {
            const end = r.end ?? r.responseAt ?? r.start
            const color = TYPE_COLORS[r.resourceType] ?? 'bg-slate-400'
            const failed = Boolean(r.failed || (r.status ?? 0) >= 400)
            return (
              <div
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-[11px] last:border-b-0 hover:bg-muted/40 @2xl:grid-cols-[minmax(0,2.2fr)_48px_64px_minmax(0,3fr)] @2xl:py-1"
              >
                <span className="truncate font-mono" title={`${r.method} ${r.url}\n${r.resourceType}${r.protocol ? ` · ${r.protocol}` : ''}${r.mimeType ? ` · ${r.mimeType}` : ''}`}>
                  {shortUrl(r.url)}
                </span>
                <span className={cn('font-mono', failed && 'text-destructive')} title={r.failed}>
                  {r.failed ? 'ERR' : (r.status ?? '…')}
                </span>
                <span className="min-w-12 text-right font-mono text-muted-foreground tabular-nums">{r.fromCache ? 'cache' : r.bytes !== undefined ? formatBytes(r.bytes) : ''}</span>
                <span className="relative col-span-3 h-2.5 @2xl:col-span-1 @2xl:h-3.5">
                  {navigations.map((n) => (n.startedAt >= from && n.startedAt <= to ? <span key={n.id} className="absolute inset-y-0 w-px bg-primary/40" style={{ left: pct(n.startedAt) }} /> : null))}
                  <span className={cn('absolute inset-y-0 rounded-sm opacity-40 @2xl:inset-y-0.5', color)} style={{ left: pct(r.start), width: `max(2px, calc(${pct(r.responseAt ?? end)} - ${pct(r.start)}))` }} />
                  {r.responseAt !== undefined && (
                    <span className={cn('absolute inset-y-0 rounded-sm @2xl:inset-y-0.5', color)} style={{ left: pct(r.responseAt), width: `max(2px, calc(${pct(end)} - ${pct(r.responseAt)}))` }} />
                  )}
                </span>
              </div>
            )
          })}
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
    <div className="@container overflow-hidden rounded-lg border">
      {entries.map((e, i) => (
        <div key={i} className="grid gap-1 border-b px-3 py-2 text-xs last:border-b-0 @xl:grid-cols-[180px_minmax(0,1fr)] @xl:items-start @xl:gap-2 @xl:py-1.5">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 font-mono text-muted-foreground tabular-nums">{formatMs(e.t)}</span>
            <Badge variant={LEVEL_VARIANT[e.level] ?? 'outline'}>{e.level}</Badge>
            <span className="font-mono text-muted-foreground">#{e.stepIndex + 1}</span>
          </div>
          <span className="min-w-0 font-mono break-words whitespace-pre-wrap">{e.text}</span>
        </div>
      ))}
    </div>
  )
}
