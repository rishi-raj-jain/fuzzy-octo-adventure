import type { NavigationRecord, RunSummary, Vitals } from '@/lib/scenario/schema'

export const MAX_COMPARE = 4

export const RUN_COLORS = [
  { label: 'A', solid: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', soft: 'bg-sky-500/10' },
  { label: 'B', solid: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/10' },
  { label: 'C', solid: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/10' },
  { label: 'D', solid: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10' },
] as const

export interface CompareFrame {
  t: number
  src: string
}

/** All filmstrip frames of a run in time order (ms since the run started). */
export function runFrames(run: RunSummary): CompareFrame[] {
  return run.steps.flatMap((s) => s.frames).sort((a, b) => a.t - b.t)
}

/**
 * Runs are aligned on the start of one of their navigations (browser start-up time varies between runs,
 * so "time since the run started" isn't comparable). Falls back to the first navigation, then to 0.
 */
export function alignmentOffset(run: RunSummary, navIndex: number) {
  return run.navigations[navIndex]?.startedAt ?? run.navigations[0]?.startedAt ?? 0
}

export function alignedNavigation(run: RunSummary, navIndex: number): NavigationRecord | undefined {
  return run.navigations[navIndex] ?? run.navigations[0]
}

/** The frame that was on screen at `t` (the last frame captured at or before it). */
export function frameAt(frames: CompareFrame[], t: number): CompareFrame | undefined {
  let lo = 0
  let hi = frames.length - 1
  let found: CompareFrame | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].t <= t) {
      found = frames[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

export const INTERVALS = [100, 200, 250, 500, 1000, 2000, 5000] as const

/** The smallest interval that keeps the strip to roughly `maxColumns` columns. */
export function autoInterval(spanMs: number, maxColumns = 60) {
  return INTERVALS.find((i) => spanMs / i <= maxColumns) ?? INTERVALS[INTERVALS.length - 1]
}

/** Milliseconds (from the aligned navigation start) after which nothing changes on screen for any run. */
export function comparisonSpan(runs: RunSummary[], navIndex: number) {
  let end = 1000
  for (const run of runs) {
    const offset = alignmentOffset(run, navIndex)
    const nav = alignedNavigation(run, navIndex)
    const nextNav = run.navigations[navIndex + 1]
    const frames = runFrames(run).filter((f) => f.t >= offset && (!nextNav || f.t < nextNav.startedAt))
    const lastFrame = frames.length ? frames[frames.length - 1].t - offset : 0
    end = Math.max(end, lastFrame, nav?.vitals.lcp ?? 0, nav?.vitals.visuallyComplete ?? 0)
  }
  return end
}

export interface Delta {
  diff: number
  pct?: number
  /** true = better than the baseline, false = worse, undefined = about the same. */
  better?: boolean
}

/** Lower is better for every timing and for CLS. Differences under 3% (or 10 ms / 0.005 CLS) count as equal. */
export function delta(base: number | undefined, value: number | undefined, kind: 'ms' | 'score' | 'count' = 'ms'): Delta | undefined {
  if (base === undefined || value === undefined || base === null || value === null) return undefined
  const diff = value - base
  const pct = base ? (diff / base) * 100 : undefined
  const floor = kind === 'score' ? 0.005 : kind === 'count' ? 0 : 10
  const same = Math.abs(diff) <= floor || (pct !== undefined && Math.abs(pct) < 3)
  return { diff, pct, better: same ? undefined : diff < 0 }
}

export const MILESTONES: { key: keyof Vitals; label: string }[] = [
  { key: 'ttfb', label: 'TTFB' },
  { key: 'firstVisualChange', label: 'First visual change' },
  { key: 'fcp', label: 'FCP' },
  { key: 'lcp', label: 'LCP' },
  { key: 'visuallyComplete', label: 'Visually complete' },
]
