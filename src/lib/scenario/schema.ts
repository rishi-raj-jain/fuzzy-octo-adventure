import { REGION_CODES } from '@/lib/regions'
import { z } from 'zod'

export const MAX_STEPS = 25
export const MAX_WAIT_SECONDS = 120

export const DEVICES = {
  desktop: { label: 'Desktop · 1366×768', width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  'desktop-hd': { label: 'Desktop HD · 1920×1080', width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  iphone: { label: 'iPhone · 390×844', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  android: { label: 'Android (Moto G Power) · 412×823', width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
} as const

export const NETWORKS = {
  none: 'No throttling',
  'Fast 4G': 'Fast 4G',
  'Slow 4G': 'Slow 4G',
  'Fast 3G': 'Fast 3G',
  'Slow 3G': 'Slow 3G',
} as const

export const WAIT_UNTIL = {
  load: 'load event',
  domcontentloaded: 'DOMContentLoaded',
  networkidle2: 'network idle (≤2 requests)',
  networkidle0: 'network idle (0 requests)',
} as const

type Keys<T> = [keyof T & string, ...(keyof T & string)[]]
const keys = <T extends object>(o: T) => Object.keys(o) as Keys<T>

const withScheme = (v: unknown) => (typeof v === 'string' && v.trim() && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v.trim()) ? `https://${v.trim()}` : typeof v === 'string' ? v.trim() : v)

export const httpUrl = z.preprocess(
  withScheme,
  z
    .string()
    .max(4000)
    .refine((v) => {
      try {
        const u = new URL(v)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    }, 'Must be a valid http(s) URL'),
)

const label = z.string().max(120).optional()
const selector = z.string().trim().min(1, 'Selector is required').max(2000)
const timeoutSeconds = z.number().min(0.1).max(MAX_WAIT_SECONDS).default(30)

export const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), label, url: httpUrl }),
  z.object({ type: z.literal('wait'), label, seconds: z.number().min(0).max(MAX_WAIT_SECONDS) }),
  z.object({ type: z.literal('script'), label, script: z.string().trim().min(1, 'Script is required').max(20000) }),
  z.object({ type: z.literal('click'), label, selector, timeoutSeconds }),
  z.object({ type: z.literal('type'), label, selector, text: z.string().max(5000), pressEnter: z.boolean().default(false), timeoutSeconds }),
  z.object({ type: z.literal('waitForSelector'), label, selector, timeoutSeconds }),
  z.object({ type: z.literal('waitForNetworkIdle'), label, idleMs: z.number().int().min(0).max(10000).default(500), timeoutSeconds }),
])

export const optionsSchema = z.object({
  device: z.enum(keys(DEVICES)).default('desktop'),
  network: z.enum(keys(NETWORKS)).default('none'),
  cpuThrottle: z.number().min(1).max(20).default(1),
  waitUntil: z.enum(keys(WAIT_UNTIL)).default('load'),
  screenshots: z.boolean().default(true),
  filmstrip: z.boolean().default(true),
  continueOnError: z.boolean().default(false),
  userAgent: z.string().max(1000).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  /** Vercel region to run in (see src/lib/regions.ts). Omit for the deployment's default region. */
  region: z.enum(REGION_CODES).optional(),
})

/**
 * Accepts either an explicit `steps` array or the shorthand `{ url, wait, script, settle }`,
 * which expands to: wait `wait` seconds → run `script` → wait `settle` seconds.
 */
export const runInputSchema = z
  .object({
    url: httpUrl,
    steps: z.array(stepSchema).max(MAX_STEPS).optional(),
    wait: z.number().min(0).max(MAX_WAIT_SECONDS).optional(),
    script: z.string().trim().min(1).max(20000).optional(),
    settle: z.number().min(0).max(MAX_WAIT_SECONDS).optional(),
    options: optionsSchema.prefault({}),
  })
  .transform(({ url, steps, wait, script, settle, options }) => {
    let resolved: Step[] = steps ?? []
    if (!steps?.length && (wait !== undefined || script)) {
      resolved = []
      if (wait) resolved.push({ type: 'wait', seconds: wait })
      if (script) resolved.push({ type: 'script', script })
      resolved.push({ type: 'wait', seconds: settle ?? 3 })
    }
    return { url, steps: resolved, options }
  })

export type Step = z.infer<typeof stepSchema>
export type StepType = Step['type']
export type RunOptions = z.infer<typeof optionsSchema>
export type RunInput = z.output<typeof runInputSchema>
export type RunRequest = z.input<typeof runInputSchema>

export const STEP_LABELS: Record<StepType, string> = {
  navigate: 'Navigate',
  wait: 'Wait',
  script: 'Run script',
  click: 'Click',
  type: 'Type',
  waitForSelector: 'Wait for selector',
  waitForNetworkIdle: 'Wait for network idle',
}

const clip = (s: string, n = 60) => {
  const line = s.split('\n').find((l) => l.trim()) ?? ''
  return line.length > n ? `${line.slice(0, n)}…` : line
}

export function describeStep(step: Step): string {
  if (step.label) return step.label
  switch (step.type) {
    case 'navigate':
      return `Navigate to ${step.url}`
    case 'wait':
      return `Wait ${step.seconds}s`
    case 'script':
      return `Run script: ${clip(step.script)}`
    case 'click':
      return `Click ${clip(step.selector)}`
    case 'type':
      return `Type into ${clip(step.selector)}${step.pressEnter ? ' + Enter' : ''}`
    case 'waitForSelector':
      return `Wait for ${clip(step.selector)}`
    case 'waitForNetworkIdle':
      return `Wait for network idle (${step.idleMs}ms)`
  }
}

// ---------- results ----------

export type RunStatus = 'ok' | 'error' | 'timeout' | 'aborted'
export type StepStatus = 'ok' | 'error' | 'skipped'

/** Times are milliseconds relative to the start of the run unless noted otherwise. */
export interface FrameRef {
  t: number
  src: string
}

export interface StepResult {
  index: number
  type: StepType
  summary: string
  status: StepStatus
  error?: string
  note?: string
  startedAt: number
  durationMs: number
  urlBefore?: string
  urlAfter?: string
  returnValue?: unknown
  /** URL changes observed while the step ran (document loads and same-document/history navigations). */
  urlChanges: { t: number; url: string; kind: 'document' | 'same-document' }[]
  metrics: {
    requests: number
    bytes: number
    failedRequests: number
    /** ms from step start until the last request that started in this step finished. */
    networkSettled?: number
    /** ms from step start to the first/last painted frame change (from the screencast). */
    firstVisualChange?: number
    lastVisualChange?: number
  }
  screenshot?: string
  frames: FrameRef[]
}

/** Vitals are milliseconds relative to the navigation start (CLS is unitless). */
export interface Vitals {
  ttfb?: number
  fcp?: number
  lcp?: number
  cls?: number
  inp?: number
  tbt?: number
  longTasks?: number
  dcl?: number
  load?: number
  firstVisualChange?: number
  visuallyComplete?: number
}

export interface NavigationRecord {
  id: string
  /** hard = a new document was loaded; soft = same-document (SPA/history) navigation. */
  kind: 'hard' | 'soft'
  url: string
  stepIndex: number
  startedAt: number
  /** What started the navigation: e.g. "initial", "pushState", "click a.nav-link". */
  trigger?: string
  /** ms from navigation start until the URL actually changed (soft navigations). */
  urlChangeAt?: number
  lcpElement?: string
  inpTarget?: string
  navType?: string
  httpStatus?: number
  vitals: Vitals
  requests: number
  bytes: number
}

export interface RequestEntry {
  id: string
  url: string
  method: string
  resourceType: string
  stepIndex: number
  start: number
  responseAt?: number
  end?: number
  status?: number
  mimeType?: string
  protocol?: string
  fromCache?: boolean
  bytes?: number
  failed?: string
}

export interface ConsoleEntry {
  t: number
  level: string
  text: string
  stepIndex: number
}

export interface RunSummary {
  id: string
  url: string
  finalUrl?: string
  title?: string
  status: RunStatus
  error?: string
  startedAt: string
  durationMs: number
  browserVersion?: string
  options: RunOptions
  steps: StepResult[]
  navigations: NavigationRecord[]
  requests: RequestEntry[]
  console: ConsoleEntry[]
  totals: { requests: number; bytes: number; failedRequests: number; navigations: number; hardNavigations: number; softNavigations: number }
  persisted: boolean
  /** Email of the user who started the run, or "api-key". */
  createdBy?: string
  /** Region the browser actually ran in: a Vercel region code, or "local". */
  region?: string
}

export type RunEvent =
  | { type: 'start'; id: string; url: string; startedAt: string; steps: string[] }
  | { type: 'step-start'; index: number; summary: string }
  | { type: 'step'; step: StepResult }
  | { type: 'navigations'; navigations: NavigationRecord[] }
  | { type: 'heartbeat'; t: number }
  | { type: 'done'; run: Omit<RunSummary, 'steps'> }
  | { type: 'error'; message: string }
