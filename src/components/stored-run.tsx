'use client'

import { liveFromSummary, RunView } from '@/components/run/run-view'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api-client'
import type { RunSummary } from '@/lib/scenario/schema'
import { ArrowLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function StoredRun({ id }: { id: string }) {
  const [run, setRun] = useState<(RunSummary & { running: boolean }) | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      const res = await apiFetch(`/api/runs/${id}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setError(body.error ?? `HTTP ${res.status}`)
      setRun(body)
      // A run started elsewhere may still be in progress: poll until it finishes.
      if (body.running) timer = setTimeout(load, 3000)
    }
    void load()
    return () => clearTimeout(timer)
  }, [id])

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft /> New run
        </Link>
        {run && (
          <Link href={`/?from=${run.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Pencil /> Edit &amp; re-run
          </Link>
        )}
      </div>
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {!run && !error && <Skeleton className="h-64" />}
      {run && <RunView run={{ ...liveFromSummary(run), running: run.running }} showPermalink={false} />}
    </div>
  )
}
