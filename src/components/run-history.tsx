'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiHeaders } from '@/hooks/use-api-key'
import { formatCls, formatMs, rate, RATING_CLASS, shortUrl } from '@/lib/format'
import type { RunListItem } from '@/lib/store'
import { cn } from '@/lib/utils'
import { History, RefreshCw, Trash2 } from 'lucide-react'
import Link from 'next/link'
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

export function RunHistory({ apiKey, refreshKey, persistence }: { apiKey: string; refreshKey: number; persistence: boolean }) {
  const [runs, setRuns] = useState<RunListItem[] | null>(null)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/runs?limit=15', { headers: apiHeaders(apiKey), cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setRuns(body.runs)
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
      setRuns([])
    }
  }, [apiKey])

  useEffect(() => {
    if (persistence) void load()
  }, [load, refreshKey, persistence])

  const remove = async (id: string) => {
    const res = await fetch(`/api/runs/${id}`, { method: 'DELETE', headers: apiHeaders(apiKey) })
    if (res.ok) {
      setRuns((r) => r?.filter((x) => x.id !== id) ?? null)
      toast.success('Run deleted')
    } else toast.error('Could not delete the run')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" /> Recent runs
        </CardTitle>
        <CardDescription>{persistence ? 'Stored in Postgres. Open one for the full report.' : 'Set DATABASE_URL to keep a history of runs.'}</CardDescription>
        {persistence && (
          <CardAction>
            <Button variant="ghost" size="icon-sm" aria-label="Refresh" onClick={() => void load()}>
              <RefreshCw />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {persistence && (
        <CardContent className="grid gap-1">
          {runs === null && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {runs?.length === 0 && !error && <p className="py-4 text-center text-sm text-muted-foreground">No runs yet.</p>}
          {runs?.map((run) => {
            const lcpRating = rate('lcp', run.initial?.lcp)
            return (
              <div key={run.id} className="group/run flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                <span className={cn('size-2 shrink-0 rounded-full', STATUS_CLASS[run.status])} title={run.status} />
                <Link href={`/runs/${run.id}`} className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-medium">{run.title || shortUrl(run.url)}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="truncate">{shortUrl(run.url)}</span>
                    <span>·</span>
                    <span>{relativeTime(run.createdAt)}</span>
                    <span>·</span>
                    <span>{run.steps} steps</span>
                    {run.navigations.soft > 0 && <Badge variant="secondary">{run.navigations.soft} soft</Badge>}
                  </span>
                </Link>
                <div className="hidden text-right sm:grid">
                  <span className={cn('font-mono text-xs tabular-nums', lcpRating && RATING_CLASS[lcpRating])}>LCP {formatMs(run.initial?.lcp)}</span>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">CLS {formatCls(run.initial?.cls)}</span>
                </div>
                <Button variant="ghost" size="icon-xs" aria-label="Delete run" className="opacity-0 group-hover/run:opacity-100" onClick={() => void remove(run.id)}>
                  <Trash2 />
                </Button>
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}
