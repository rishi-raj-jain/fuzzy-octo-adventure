'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatBytes, formatMs, formatVital, rate, RATING_CLASS, RATING_DOT, shortUrl, VITAL_META } from '@/lib/format'
import type { NavigationRecord, Vitals } from '@/lib/scenario/schema'
import { cn } from '@/lib/utils'
import { ArrowRightLeft, FileDown } from 'lucide-react'

const HARD_KEYS: (keyof Vitals)[] = ['ttfb', 'fcp', 'lcp', 'cls', 'inp', 'tbt', 'firstVisualChange', 'visuallyComplete', 'dcl', 'load']
const SOFT_KEYS: (keyof Vitals)[] = ['fcp', 'lcp', 'cls', 'inp', 'tbt', 'firstVisualChange', 'visuallyComplete']

export function VitalCell({ name, value }: { name: keyof Vitals; value?: number }) {
  const rating = rate(name, value)
  return (
    <Tooltip>
      <TooltipTrigger render={<div className="min-w-0 rounded-md bg-muted/50 px-2.5 py-2 text-left" />}>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {rating && <span className={cn('size-1.5 rounded-full', RATING_DOT[rating])} />}
          <span className="truncate">{VITAL_META[name].label}</span>
        </div>
        <div className={cn('font-mono text-sm font-medium tabular-nums', rating && RATING_CLASS[rating])}>{formatVital(name, value)}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{VITAL_META[name].hint}</TooltipContent>
    </Tooltip>
  )
}

export function NavigationCard({ nav, index }: { nav: NavigationRecord; index: number }) {
  const keys = nav.kind === 'hard' ? HARD_KEYS : SOFT_KEYS
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>
        {nav.kind === 'hard' ? (
          <Badge variant="default">
            <FileDown /> Hard navigation
          </Badge>
        ) : (
          <Badge variant="secondary">
            <ArrowRightLeft /> Soft navigation
          </Badge>
        )}
        <a href={nav.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm font-medium hover:underline" title={nav.url}>
          {shortUrl(nav.url)}
        </a>
        {nav.httpStatus && nav.httpStatus >= 400 && <Badge variant="destructive">HTTP {nav.httpStatus}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          step {nav.stepIndex + 1} · +{formatMs(nav.startedAt)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-4 xl:grid-cols-5">
        {keys.map((k) => (
          <VitalCell key={k} name={k} value={nav.vitals[k]} />
        ))}
      </div>
      <div className="grid gap-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <div>
          <span className="text-foreground">Trigger:</span> {nav.trigger ?? '—'}
          {nav.kind === 'soft' && nav.urlChangeAt !== undefined && <> · URL changed after {formatMs(nav.urlChangeAt)}</>}
        </div>
        {nav.lcpElement && (
          <div className="truncate" title={nav.lcpElement}>
            <span className="text-foreground">LCP element:</span> <code className="font-mono">{nav.lcpElement}</code>
          </div>
        )}
        {nav.inpTarget && (
          <div className="truncate" title={nav.inpTarget}>
            <span className="text-foreground">Slowest interaction:</span> <code className="font-mono">{nav.inpTarget}</code>
          </div>
        )}
        <div>
          <span className="text-foreground">Network:</span> {nav.requests} requests · {formatBytes(nav.bytes)}
          {nav.vitals.longTasks ? ` · ${nav.vitals.longTasks} long task${nav.vitals.longTasks === 1 ? '' : 's'}` : ''}
        </div>
      </div>
    </div>
  )
}

export function NavigationsPanel({ navigations, running }: { navigations: NavigationRecord[]; running: boolean }) {
  if (!navigations.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{running ? 'Waiting for the first navigation…' : 'No navigations were recorded.'}</p>
  }
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Every page load is measured: <b>hard</b> navigations load a new document (direct loads, link clicks, form posts, <code>location</code> changes); <b>soft</b> navigations are client-side route changes (
        <code>history.pushState</code> / Navigation API). Soft-navigation paint metrics are measured from the interaction that triggered them.
      </p>
      {navigations.map((nav, i) => (
        <NavigationCard key={nav.id} nav={nav} index={i} />
      ))}
    </div>
  )
}
