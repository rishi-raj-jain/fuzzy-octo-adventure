'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { alignedNavigation, alignmentOffset, delta, frameAt, MILESTONES, RUN_COLORS, runFrames, type Delta } from '@/lib/compare'
import { formatBytes, formatMs, formatVital, rate, RATING_CLASS, RATING_DOT, shortUrl, VITAL_META } from '@/lib/format'
import { regionLabel } from '@/lib/regions'
import { DEVICES, type RunSummary, type Vitals } from '@/lib/scenario/schema'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

function RunBadge({ index, className }: { index: number; className?: string }) {
  const c = RUN_COLORS[index]
  return <span className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-white', c.solid, className)}>{c.label}</span>
}

export { RunBadge }

// ---------------------------------------------------------------------------------------------------------------
// Filmstrip: one row per run, one column per time slice, all aligned on the chosen navigation's start.
// ---------------------------------------------------------------------------------------------------------------

const MARKERS: { key: keyof Vitals; label: string; className: string }[] = [
  { key: 'fcp', label: 'FCP', className: 'bg-emerald-600 text-white' },
  { key: 'lcp', label: 'LCP', className: 'bg-red-600 text-white' },
  { key: 'visuallyComplete', label: 'VC', className: 'bg-foreground text-background' },
]

export function FilmstripCompare({ runs, navIndex, interval, end, thumb }: { runs: RunSummary[]; navIndex: number; interval: number; end: number; thumb: number }) {
  const columns = Math.min(Math.ceil(end / interval) + 1, 300)
  const ticks = Array.from({ length: columns }, (_, i) => i * interval)
  const rows = useMemo(
    () =>
      runs.map((run) => {
        const frames = runFrames(run)
        const offset = alignmentOffset(run, navIndex)
        const nav = alignedNavigation(run, navIndex)
        return { run, nav, cells: ticks.map((t) => frameAt(frames, offset + t)) }
      }),
    [runs, navIndex, interval, columns],
  )

  return (
    <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:mx-0 sm:px-0">
      <table className="border-separate border-spacing-x-1.5 border-spacing-y-2">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background" />
            {ticks.map((t) => (
              <th key={t} className="text-left font-mono text-[11px] font-normal whitespace-nowrap text-muted-foreground tabular-nums" style={{ width: thumb }}>
                {formatMs(t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ run, nav, cells }, r) => (
            <tr key={run.id}>
              <th scope="row" className="sticky left-0 z-10 bg-background pr-2 text-left align-top">
                <div className="flex items-center gap-1.5">
                  <RunBadge index={r} />
                  <span className="hidden max-w-32 truncate text-xs font-medium sm:inline" title={run.url}>
                    {shortUrl(run.finalUrl ?? run.url)}
                  </span>
                </div>
              </th>
              {cells.map((frame, i) => {
                const changed = frame && frame.src !== cells[i - 1]?.src
                const prev = i === 0 ? -Infinity : ticks[i - 1]
                const marks = MARKERS.filter(({ key }) => {
                  const v = nav?.vitals[key]
                  return v !== undefined && v > prev && v <= ticks[i]
                })
                return (
                  <td key={i} className="align-top" style={{ width: thumb, minWidth: thumb }}>
                    <div className={cn('overflow-hidden rounded-md border-2 bg-muted', changed ? 'border-amber-500' : 'border-transparent ring-1 ring-border')}>
                      {frame ? (
                        <img src={frame.src} alt={`${RUN_COLORS[r].label} at ${formatMs(ticks[i])}`} className="block w-full" draggable={false} />
                      ) : (
                        <div className="flex items-center justify-center text-[10px] text-muted-foreground" style={{ aspectRatio: `${DEVICES[run.options.device].width} / ${DEVICES[run.options.device].height}` }}>
                          nothing yet
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex h-4 gap-0.5">
                      {marks.map((m) => (
                        <span key={m.key} className={cn('rounded px-1 text-[9px] leading-4 font-semibold', m.className)} title={`${m.label} ${formatMs(nav?.vitals[m.key])}`}>
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Milestones: bars for each timing, one per run, on a shared scale.
// ---------------------------------------------------------------------------------------------------------------

export function MilestonesCompare({ runs, navIndex }: { runs: RunSummary[]; navIndex: number }) {
  const navs = runs.map((run) => alignedNavigation(run, navIndex))
  const max = Math.max(1, ...navs.flatMap((n) => MILESTONES.map((m) => n?.vitals[m.key] ?? 0)))
  const visible = MILESTONES.filter((m) => navs.some((n) => n?.vitals[m.key] !== undefined))
  if (!visible.length) return <p className="text-sm text-muted-foreground">No timings recorded for this navigation.</p>
  return (
    <div className="grid gap-4">
      {visible.map((m) => (
        <div key={m.key} className="grid gap-1.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-3">
          <span className="text-xs font-medium">{m.label}</span>
          <div className="grid gap-1">
            {navs.map((nav, r) => {
              const v = nav?.vitals[m.key]
              const d = r > 0 ? delta(navs[0]?.vitals[m.key], v) : undefined
              return (
                <div key={runs[r].id} className="flex min-w-0 items-center gap-2">
                  <RunBadge index={r} className="size-4 text-[9px]" />
                  <div className="h-3 min-w-0 flex-1 rounded-sm bg-muted">
                    {v !== undefined && <div className={cn('h-full rounded-sm', RUN_COLORS[r].solid)} style={{ width: `${Math.max((v / max) * 100, 0.8)}%` }} />}
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">{formatMs(v)}</span>
                  <DeltaText d={d} kind="ms" className="hidden w-24 shrink-0 sm:block" />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Metrics table: run totals and every navigation's vitals, with deltas against run A.
// ---------------------------------------------------------------------------------------------------------------

function DeltaText({ d, kind, className }: { d?: Delta; kind: 'ms' | 'score' | 'count' | 'bytes'; className?: string }) {
  if (!d) return <span className={className} />
  const sign = d.diff > 0 ? '+' : d.diff < 0 ? '−' : '±'
  const abs = Math.abs(d.diff)
  const value = kind === 'score' ? abs.toFixed(3) : kind === 'count' ? String(abs) : kind === 'bytes' ? formatBytes(abs) : formatMs(abs)
  const tone = d.better === undefined ? 'text-muted-foreground' : d.better ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  return (
    <span className={cn('font-mono text-[11px] whitespace-nowrap tabular-nums', tone, className)}>
      {sign}
      {value}
      {d.pct !== undefined && Number.isFinite(d.pct) && ` (${d.pct > 0 ? '+' : ''}${Math.round(d.pct)}%)`}
    </span>
  )
}

const NAV_ROWS: (keyof Vitals)[] = ['ttfb', 'fcp', 'lcp', 'cls', 'inp', 'tbt', 'firstVisualChange', 'visuallyComplete', 'load']

export function MetricsCompare({ runs }: { runs: RunSummary[] }) {
  const navCount = Math.max(...runs.map((r) => r.navigations.length))
  const Cell = ({ children, className }: { children: React.ReactNode; className?: string }) => <td className={cn('border-b px-3 py-2 align-top', className)}>{children}</td>
  const Section = ({ title }: { title: React.ReactNode }) => (
    <tr>
      <th colSpan={runs.length + 1} className="bg-muted/50 px-3 py-1.5 text-left text-xs font-medium">
        {title}
      </th>
    </tr>
  )
  const totalRow = (label: string, get: (r: RunSummary) => number, kind: 'ms' | 'count' | 'bytes') => (
    <tr key={label}>
      <th scope="row" className="sticky left-0 border-b bg-card px-3 py-2 text-left text-xs font-normal text-muted-foreground">
        {label}
      </th>
      {runs.map((run, r) => (
        <Cell key={run.id}>
          <div className="font-mono text-sm tabular-nums">{kind === 'bytes' ? formatBytes(get(run)) : kind === 'count' ? get(run) : formatMs(get(run))}</div>
          {r > 0 && <DeltaText d={delta(get(runs[0]), get(run), kind === 'bytes' ? 'count' : kind)} kind={kind} />}
        </Cell>
      ))}
    </tr>
  )

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">Metric</th>
            {runs.map((run, r) => (
              <th key={run.id} className="border-b px-3 py-2 text-left">
                <div className="flex min-w-0 items-center gap-1.5">
                  <RunBadge index={r} />
                  <span className="truncate text-xs font-medium" title={run.url}>
                    {shortUrl(run.finalUrl ?? run.url)}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Section title="Run" />
          <tr>
            <th scope="row" className="sticky left-0 border-b bg-card px-3 py-2 text-left text-xs font-normal text-muted-foreground">
              Region
            </th>
            {runs.map((run) => (
              <Cell key={run.id}>
                <div className="text-xs">{run.region ? regionLabel(run.region) : '—'}</div>
              </Cell>
            ))}
          </tr>
          {totalRow('Duration', (r) => r.durationMs, 'ms')}
          {totalRow('Requests', (r) => r.totals.requests, 'count')}
          {totalRow('Transferred', (r) => r.totals.bytes, 'bytes')}
          {Array.from({ length: navCount }, (_, n) => (
            <NavSection key={n} n={n} runs={runs} Section={Section} Cell={Cell} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NavSection({
  n,
  runs,
  Section,
  Cell,
}: {
  n: number
  runs: RunSummary[]
  Section: (p: { title: React.ReactNode }) => React.ReactNode
  Cell: (p: { children: React.ReactNode; className?: string }) => React.ReactNode
}) {
  const navs = runs.map((r) => r.navigations[n])
  const kinds = [...new Set(navs.filter(Boolean).map((v) => v!.kind))]
  const rows = NAV_ROWS.filter((k) => navs.some((v) => v?.vitals[k] !== undefined))
  return (
    <>
      <Section title={`Navigation #${n + 1}${n === 0 ? ' · initial load' : ''} · ${kinds.join(' / ')}`} />
      {rows.map((key) => (
        <tr key={key}>
          <th scope="row" className="sticky left-0 border-b bg-card px-3 py-2 text-left text-xs font-normal text-muted-foreground">
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help underline decoration-dotted underline-offset-2" />}>{VITAL_META[key].label}</TooltipTrigger>
              <TooltipContent className="max-w-64">{VITAL_META[key].hint}</TooltipContent>
            </Tooltip>
          </th>
          {navs.map((nav, r) => {
            const v = nav?.vitals[key]
            const rating = rate(key, v)
            const unit = VITAL_META[key].unit
            return (
              <Cell key={runs[r].id}>
                {nav ? (
                  <>
                    <div className={cn('flex items-center gap-1.5 font-mono text-sm tabular-nums', rating && RATING_CLASS[rating])}>
                      {rating && <span className={cn('size-1.5 rounded-full', RATING_DOT[rating])} />}
                      {formatVital(key, v)}
                    </div>
                    {r > 0 && <DeltaText d={delta(navs[0]?.vitals[key], v, unit)} kind={unit} />}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">no navigation</span>
                )}
              </Cell>
            )
          })}
        </tr>
      ))}
    </>
  )
}
