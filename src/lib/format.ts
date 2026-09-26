import type { Vitals } from '@/lib/scenario/schema'

export function formatMs(ms?: number | null) {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function formatCls(v?: number | null) {
  return v === undefined || v === null ? '—' : v.toFixed(3)
}

export type Rating = 'good' | 'needs-improvement' | 'poor'

/** Thresholds from web.dev (TTFB/FCP/LCP/INP/CLS) and Lighthouse (TBT). */
export const VITAL_META: Record<keyof Vitals, { label: string; hint: string; thresholds?: [number, number]; unit: 'ms' | 'score' | 'count' }> = {
  ttfb: { label: 'TTFB', hint: 'Time to first byte of the document', thresholds: [800, 1800], unit: 'ms' },
  fcp: { label: 'FCP', hint: 'First Contentful Paint (soft navigations: first new content painted after the interaction)', thresholds: [1800, 3000], unit: 'ms' },
  lcp: { label: 'LCP', hint: 'Largest Contentful Paint (soft navigations: largest new content painted after the interaction)', thresholds: [2500, 4000], unit: 'ms' },
  cls: { label: 'CLS', hint: 'Cumulative Layout Shift (largest session window) during this navigation', thresholds: [0.1, 0.25], unit: 'score' },
  inp: { label: 'INP', hint: 'Slowest interaction (input → next paint) during this navigation', thresholds: [200, 500], unit: 'ms' },
  tbt: { label: 'TBT', hint: 'Blocking time: sum of long-task time above 50 ms during this navigation', thresholds: [200, 600], unit: 'ms' },
  longTasks: { label: 'Long tasks', hint: 'Number of main-thread tasks longer than 50 ms', unit: 'count' },
  dcl: { label: 'DCL', hint: 'DOMContentLoaded', unit: 'ms' },
  load: { label: 'Load', hint: 'window load event', unit: 'ms' },
  firstVisualChange: { label: 'First visual change', hint: 'First frame that changed on screen (from the screen recording)', unit: 'ms' },
  visuallyComplete: { label: 'Visually complete', hint: 'Last frame that changed on screen before the next interaction (from the screen recording)', unit: 'ms' },
}

export function rate(key: keyof Vitals, value?: number): Rating | undefined {
  const t = VITAL_META[key].thresholds
  if (!t || value === undefined || value === null) return undefined
  return value <= t[0] ? 'good' : value <= t[1] ? 'needs-improvement' : 'poor'
}

export function formatVital(key: keyof Vitals, value?: number) {
  const unit = VITAL_META[key].unit
  if (value === undefined || value === null) return '—'
  return unit === 'score' ? formatCls(value) : unit === 'count' ? String(value) : formatMs(value)
}

export const RATING_CLASS: Record<Rating, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  'needs-improvement': 'text-amber-600 dark:text-amber-400',
  poor: 'text-red-600 dark:text-red-400',
}

export const RATING_DOT: Record<Rating, string> = {
  good: 'bg-emerald-500',
  'needs-improvement': 'bg-amber-500',
  poor: 'bg-red-500',
}

export function shortUrl(url: string) {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}${u.search}`
  } catch {
    return url
  }
}
