'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api-client'
import { authClient } from '@/lib/auth/client'
import { MAX_COMPARE } from '@/lib/compare'
import { formatCls, formatMs, rate, RATING_CLASS, shortUrl } from '@/lib/format'
import { regionLabel } from '@/lib/regions'
import type { RunListItem } from '@/lib/store'
import { cn } from '@/lib/utils'
import { GitCompareArrows, History, RefreshCw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-emerald-500',
  error: 'bg-destructive',
  timeout: 'bg-amber-500',
  aborted: 'bg-muted-foreground',
  running: 'bg-sky-500 animate-pulse',
}

function relativeTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function RunHistory({ refreshKey, persistence, authMode }: { refreshKey: number; persistence: boolean; authMode?: 'neon' | 'disabled' | 'misconfigured' }) {
  const [runs, setRuns] = useState<RunListItem[] | null>(null)
  const [error, setError] = useState<string>()
  const [mine, setMine] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const router = useRouter()
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s.filter((x) => x !== id), id].slice(-MAX_COMPARE) : s.filter((x) => x !== id)))
  const { data: session } = authClient.useSession()
  const viewerEmail = authMode === 'disabled' ? 'dev@localhost' : session?.user.email

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/runs?limit=15${mine ? '&mine=1' : ''}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setRuns(body.runs)
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
      setRuns([])
    }
  }, [mine])

  useEffect(() => {
    if (persistence) void load()
  }, [load, refreshKey, persistence])

  const remove = async (id: string) => {
    const res = await apiFetch(`/api/runs/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setRuns((r) => r?.filter((x) => x.id !== id) ?? null)
      toast.success('Run deleted')
    } else toast.error((await res.json().catch(() => ({}))).error ?? 'Could not delete the run')
  }

  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" /> Recent runs
        </CardTitle>
        <CardDescription>{persistence ? 'Shared with your team. Open one for the full report, or tick two or more to compare.' : 'Set DATABASE_URL to keep a history of runs.'}</CardDescription>
        {persistence && (
          <CardAction className="flex items-center gap-1">
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              {[
                [false, 'All'],
                [true, 'Mine'],
              ].map(([value, label]) => (
                <button
                  key={String(label)}
                  type="button"
                  onClick={() => setMine(value as boolean)}
                  className={cn('rounded-md px-2 py-1 pointer-coarse:px-3 pointer-coarse:py-1.5', mine === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-9" aria-label="Refresh" onClick={() => void load()}>
              <RefreshCw />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {persistence && (
        <CardContent className="grid gap-1 px-2 @sm:px-4">
          {runs === null && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          {error && <p className="px-2 text-sm text-destructive">{error}</p>}
          {runs?.length === 0 && !error && <p className="py-4 text-center text-sm text-muted-foreground">No runs yet.</p>}
          {runs?.map((run) => {
            const lcpRating = rate('lcp', run.initial?.lcp)
            const canDelete = !run.createdBy || run.createdBy === viewerEmail
            return (
              <div key={run.id} className={cn('group/run flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 pointer-coarse:py-2.5', selected.includes(run.id) && 'bg-muted/60')}>
                <Checkbox
                  aria-label={`Select ${run.title || shortUrl(run.url)} for comparison`}
                  checked={selected.includes(run.id)}
                  disabled={run.status === 'running'}
                  onCheckedChange={(on) => toggle(run.id, on)}
                  className="pointer-coarse:size-5"
                />
                <span className={cn('size-2 shrink-0 rounded-full', STATUS_CLASS[run.status])} title={run.status} />
                <Link href={`/runs/${run.id}`} className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-medium">{run.title || shortUrl(run.url)}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="max-w-full truncate">{shortUrl(run.url)}</span>
                    <span aria-hidden>·</span>
                    <span className="whitespace-nowrap">{relativeTime(run.createdAt)}</span>
                    {run.createdBy && run.createdBy !== viewerEmail && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="max-w-40 truncate">{run.createdBy.split('@')[0]}</span>
                      </>
                    )}
                    {run.region && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-mono" title={regionLabel(run.region)}>
                          {run.region}
                        </span>
                      </>
                    )}
                    <span className="hidden @md:inline" aria-hidden>
                      ·
                    </span>
                    <span className="hidden whitespace-nowrap @md:inline">{run.steps} steps</span>
                    {run.navigations.soft > 0 && <Badge variant="secondary">{run.navigations.soft} soft</Badge>}
                  </span>
                  <span className={cn('font-mono text-[11px] tabular-nums @md:hidden', lcpRating && RATING_CLASS[lcpRating])}>
                    LCP {formatMs(run.initial?.lcp)} <span className="text-muted-foreground">· CLS {formatCls(run.initial?.cls)}</span>
                  </span>
                </Link>
                <div className="hidden shrink-0 text-right @md:grid">
                  <span className={cn('font-mono text-xs tabular-nums', lcpRating && RATING_CLASS[lcpRating])}>LCP {formatMs(run.initial?.lcp)}</span>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">CLS {formatCls(run.initial?.cls)}</span>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete run"
                    className="shrink-0 pointer-coarse:size-9 pointer-fine:opacity-0 pointer-fine:group-focus-within/run:opacity-100 pointer-fine:group-hover/run:opacity-100"
                    onClick={() => void remove(run.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            )
          })}
          {selected.length > 0 && (
            <div className="sticky bottom-2 z-10 mt-2 flex items-center gap-2 rounded-lg border bg-card/95 p-2 pl-3 shadow-sm backdrop-blur">
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {selected.length === 1 ? 'Select one more run to compare' : `${selected.length} runs selected`}
                {selected.length >= MAX_COMPARE && ` (max ${MAX_COMPARE})`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
              <Button size="sm" disabled={selected.length < 2} onClick={() => router.push(`/compare?runs=${selected.join(',')}`)}>
                <GitCompareArrows /> Compare
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
