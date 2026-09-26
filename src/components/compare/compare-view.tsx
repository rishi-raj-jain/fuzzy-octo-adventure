'use client'

import { FilmstripCompare, MetricsCompare, MilestonesCompare, RunBadge } from '@/components/compare/compare-panels'
import { SimpleSelect } from '@/components/simple-select'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api-client'
import { autoInterval, comparisonSpan, INTERVALS, MAX_COMPARE, RUN_COLORS } from '@/lib/compare'
import { formatMs, shortUrl } from '@/lib/format'
import { regionLabel } from '@/lib/regions'
import { DEVICES, NETWORKS, type RunSummary } from '@/lib/scenario/schema'
import type { RunListItem } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ArrowLeft, Film, GitCompareArrows, Link2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

const THUMBS = { '96': 'Small', '144': 'Medium', '200': 'Large' } as const

export function CompareView() {
  const router = useRouter()
  const params = useSearchParams()
  const ids = useMemo(() => (params.get('runs') ?? '').split(',').filter(Boolean).slice(0, MAX_COMPARE), [params])
  const [runs, setRuns] = useState<Record<string, RunSummary | { error: string }>>({})
  const [recent, setRecent] = useState<RunListItem[]>([])
  const [navIndex, setNavIndex] = useState('0')
  const [interval, setInterval] = useState<string>('auto')
  const [thumb, setThumb] = useState<keyof typeof THUMBS>('144')

  // Phones fit more of the timeline with small thumbnails.
  useEffect(() => {
    if (window.matchMedia('(max-width: 639px)').matches) setThumb('96')
  }, [])

  useEffect(() => {
    for (const id of ids) {
      if (runs[id]) continue
      apiFetch(`/api/runs/${id}`, { cache: 'no-store' })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}))
          setRuns((prev) => ({ ...prev, [id]: res.ok ? body : { error: body.error ?? `HTTP ${res.status}` } }))
        })
        .catch((e) => setRuns((prev) => ({ ...prev, [id]: { error: (e as Error).message } })))
    }
  }, [ids])

  useEffect(() => {
    apiFetch('/api/runs?limit=30', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => setRecent(b.runs ?? []))
      .catch(() => {})
  }, [])

  const setIds = (next: string[]) => router.replace(next.length ? `/compare?runs=${next.join(',')}` : '/compare', { scroll: false })
  const loaded = ids.map((id) => runs[id]).filter((r): r is RunSummary => Boolean(r && !('error' in r)))
  const failed = ids.filter((id) => runs[id] && 'error' in runs[id]!)
  const loading = ids.some((id) => !runs[id])
  const ready = !loading && loaded.length >= 1

  const nav = Number(navIndex)
  const navCount = Math.max(0, ...loaded.map((r) => r.navigations.length))
  const navOptions = Object.fromEntries(
    Array.from({ length: Math.max(navCount, 1) }, (_, i) => {
      const kinds = [...new Set(loaded.map((r) => r.navigations[i]?.kind).filter(Boolean))].join(' / ')
      return [String(i), i === 0 ? 'Initial load' : `Navigation #${i + 1}${kinds ? ` (${kinds})` : ''}`]
    }),
  )
  const span = ready ? comparisonSpan(loaded, nav) : 0
  const step = interval === 'auto' ? autoInterval(span) : Number(interval)
  const intervalOptions = { auto: `Auto (${formatMs(autoInterval(span || 1000))})`, ...Object.fromEntries(INTERVALS.map((i) => [String(i), formatMs(i)])) }
  const addable = recent.filter((r) => !ids.includes(r.id) && r.status !== 'running')

  return (
    <div className="grid min-w-0 gap-4 sm:gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft /> New run
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <GitCompareArrows className="size-5" /> Compare runs
        </h1>
        {ids.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href)
              toast.success('Comparison link copied')
            }}
          >
            <Link2 /> Copy link
          </Button>
        )}
      </div>

      {/* Runs in the comparison */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ids.map((id, i) => {
          const run = runs[id]
          return (
            <Card key={id} size="sm" className={cn('relative', RUN_COLORS[i].soft)}>
              <CardHeader>
                <CardTitle className="flex min-w-0 items-center gap-2 pr-8">
                  <RunBadge index={i} />
                  <span className="truncate">{run && !('error' in run) ? run.title || shortUrl(run.url) : run ? 'Could not load' : 'Loading…'}</span>
                </CardTitle>
                <CardDescription className="truncate">
                  {run && !('error' in run) ? (
                    <Link href={`/runs/${id}`} className="hover:underline" title={run.url}>
                      {shortUrl(run.finalUrl ?? run.url)}
                    </Link>
                  ) : run ? (
                    run.error
                  ) : (
                    <Skeleton className="h-4 w-40" />
                  )}
                </CardDescription>
                <Button variant="ghost" size="icon-xs" className="absolute top-2 right-2 pointer-coarse:size-8" aria-label="Remove from comparison" onClick={() => setIds(ids.filter((x) => x !== id))}>
                  <X />
                </Button>
              </CardHeader>
              {run && !('error' in run) && (
                <CardContent className="text-xs text-muted-foreground">
                  {run.region && <span title={regionLabel(run.region)}>{run.region} · </span>}
                  {DEVICES[run.options.device].label.split(' · ')[0]} · {NETWORKS[run.options.network]} · {new Date(run.startedAt).toLocaleString()}
                </CardContent>
              )}
            </Card>
          )
        })}
        {ids.length < MAX_COMPARE && (
          <Card size="sm" className="ring-dashed border-dashed bg-transparent shadow-none ring-1 ring-border">
            <CardContent className="grid gap-2">
              <Label htmlFor="add-run" className="text-xs text-muted-foreground">
                {ids.length ? 'Add another run' : 'Pick runs to compare'}
              </Label>
              {addable.length ? (
                <SimpleSelect
                  id="add-run"
                  value={'' as string}
                  options={Object.fromEntries([['', 'Choose a run…'], ...addable.map((r) => [r.id, `${r.title || shortUrl(r.url)} · ${new Date(r.createdAt).toLocaleString()}`])])}
                  onChange={(id) => id && setIds([...ids, id])}
                />
              ) : (
                <p className="text-xs text-muted-foreground">No other runs yet.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {failed.length > 0 && <p className="text-sm text-destructive">Some runs could not be loaded and were skipped.</p>}
      {loading && <Skeleton className="h-64" />}
      {ready && loaded.length < 2 && <p className="text-sm text-muted-foreground">Add at least one more run to compare.</p>}

      {ready && loaded.length >= 2 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="size-4" /> Filmstrip
              </CardTitle>
              <CardDescription>What each run showed over time, aligned on the start of the selected navigation. Highlighted frames changed since the previous one.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="align">Align on</Label>
                  <SimpleSelect id="align" value={navIndex} options={navOptions} onChange={setNavIndex} />
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="interval">Interval</Label>
                  <SimpleSelect id="interval" value={interval} options={intervalOptions} onChange={setInterval} />
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="thumb">Thumbnails</Label>
                  <SimpleSelect id="thumb" value={thumb} options={THUMBS} onChange={setThumb} />
                </div>
              </div>
              <FilmstripCompare runs={loaded} navIndex={nav} interval={step} end={span} thumb={Number(thumb)} />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-sm border-2 border-amber-500" /> visual change
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded bg-emerald-600 px-1 text-[9px] font-semibold text-white">FCP</span> first contentful paint
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded bg-red-600 px-1 text-[9px] font-semibold text-white">LCP</span> largest contentful paint
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded bg-foreground px-1 text-[9px] font-semibold text-background">VC</span> visually complete
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timings</CardTitle>
              <CardDescription>{navOptions[navIndex]}: milestones on a shared scale. Differences are relative to run A.</CardDescription>
            </CardHeader>
            <CardContent>
              <MilestonesCompare runs={loaded} navIndex={nav} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All metrics</CardTitle>
              <CardDescription>Every navigation side by side. Green is faster (or less shift) than run A, red is slower.</CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsCompare runs={loaded} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
