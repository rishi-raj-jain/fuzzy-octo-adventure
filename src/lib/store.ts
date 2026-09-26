import { assets, getDb, navigations, runs, type NavigationRow, type RunRow } from '@/db'
import type { AssetSink } from '@/lib/scenario/runner'
import type { NavigationRecord, RunInput, RunRequest, RunSummary } from '@/lib/scenario/schema'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'

const MAX_INSERT_CHARS = 3_000_000

/** Buffers screenshots/frames and writes them in batches; the run references them by URL. */
export function dbAssetSink(runId: string): AssetSink {
  let queue: { id: string; runId: string; kind: 'screenshot' | 'frame'; data: string }[] = []
  return {
    put(kind, data) {
      const id = crypto.randomUUID()
      queue.push({ id, runId, kind, data })
      return `/api/assets/${id}`
    },
    async flush() {
      const pending = queue
      queue = []
      let batch: typeof pending = []
      let size = 0
      const write = async () => {
        if (batch.length) await getDb().insert(assets).values(batch)
        batch = []
        size = 0
      }
      for (const item of pending) {
        if (size + item.data.length > MAX_INSERT_CHARS) await write()
        batch.push(item)
        size += item.data.length
      }
      await write()
    },
  }
}

export async function createRun(id: string, request: RunRequest, input: RunInput, createdBy: string) {
  await getDb().insert(runs).values({ id, url: input.url, status: 'running', createdBy, device: input.options.device, network: input.options.network, input: request, options: input.options })
}

export async function finishRun(run: RunSummary) {
  const db = getDb()
  await db
    .update(runs)
    .set({
      status: run.status,
      error: run.error,
      finishedAt: new Date(),
      finalUrl: run.finalUrl,
      title: run.title,
      durationMs: run.durationMs,
      browserVersion: run.browserVersion,
      totalRequests: run.totals.requests,
      totalBytes: run.totals.bytes,
      steps: run.steps,
      requests: run.requests,
      console: run.console,
    })
    .where(eq(runs.id, run.id))
  if (run.navigations.length) {
    await db.insert(navigations).values(
      run.navigations.map((n, position) => ({
        id: `${run.id}:${position}`,
        runId: run.id,
        position,
        kind: n.kind,
        url: n.url,
        stepIndex: n.stepIndex,
        startedAtMs: n.startedAt,
        trigger: n.trigger,
        navType: n.navType,
        httpStatus: n.httpStatus,
        urlChangeAt: n.urlChangeAt,
        lcpElement: n.lcpElement,
        inpTarget: n.inpTarget,
        requests: n.requests,
        bytes: n.bytes,
        ...n.vitals,
      })),
    )
  }
}

const toNavigation = (n: NavigationRow): NavigationRecord => ({
  id: n.id,
  kind: n.kind,
  url: n.url,
  stepIndex: n.stepIndex,
  startedAt: n.startedAtMs,
  trigger: n.trigger ?? undefined,
  urlChangeAt: n.urlChangeAt ?? undefined,
  lcpElement: n.lcpElement ?? undefined,
  inpTarget: n.inpTarget ?? undefined,
  navType: n.navType ?? undefined,
  httpStatus: n.httpStatus ?? undefined,
  requests: n.requests,
  bytes: n.bytes,
  vitals: {
    ttfb: n.ttfb ?? undefined,
    fcp: n.fcp ?? undefined,
    lcp: n.lcp ?? undefined,
    cls: n.cls ?? undefined,
    inp: n.inp ?? undefined,
    tbt: n.tbt ?? undefined,
    longTasks: n.longTasks ?? undefined,
    dcl: n.dcl ?? undefined,
    load: n.load ?? undefined,
    firstVisualChange: n.firstVisualChange ?? undefined,
    visuallyComplete: n.visuallyComplete ?? undefined,
  },
})

function toSummary(row: RunRow, navs: NavigationRow[]): RunSummary {
  const requests = row.requests ?? []
  const navigationRecords = navs.sort((a, b) => a.position - b.position).map(toNavigation)
  return {
    id: row.id,
    url: row.url,
    finalUrl: row.finalUrl ?? undefined,
    title: row.title ?? undefined,
    status: row.status === 'running' ? 'aborted' : row.status,
    error: row.status === 'running' ? 'Run did not finish (still running, or the function was terminated)' : (row.error ?? undefined),
    startedAt: row.createdAt.toISOString(),
    durationMs: row.durationMs ?? 0,
    browserVersion: row.browserVersion ?? undefined,
    options: row.options,
    steps: row.steps ?? [],
    navigations: navigationRecords,
    requests,
    console: row.console ?? [],
    totals: {
      requests: row.totalRequests ?? requests.length,
      bytes: row.totalBytes ?? 0,
      failedRequests: requests.filter((r) => r.failed || (r.status ?? 0) >= 400).length,
      navigations: navigationRecords.length,
      hardNavigations: navigationRecords.filter((n) => n.kind === 'hard').length,
      softNavigations: navigationRecords.filter((n) => n.kind === 'soft').length,
    },
    persisted: true,
    createdBy: row.createdBy ?? undefined,
  }
}

export async function getRun(id: string) {
  const db = getDb()
  const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1)
  if (!row) return null
  const navs = await db.select().from(navigations).where(eq(navigations.runId, id))
  return { summary: toSummary(row, navs), running: row.status === 'running', input: row.input }
}

export interface RunListItem {
  id: string
  url: string
  finalUrl?: string
  title?: string
  status: RunRow['status']
  createdBy?: string
  createdAt: string
  durationMs?: number
  device: string
  network: string
  steps: number
  navigations: { hard: number; soft: number }
  initial?: { ttfb?: number; fcp?: number; lcp?: number; cls?: number }
}

export async function listRuns({ limit = 20, before, url, createdBy }: { limit?: number; before?: string; url?: string; createdBy?: string }) {
  const db = getDb()
  const conditions = [before ? lt(runs.createdAt, new Date(before)) : undefined, url ? eq(runs.url, url) : undefined, createdBy ? eq(runs.createdBy, createdBy) : undefined].filter(Boolean)
  const rows = await db
    .select({
      id: runs.id,
      url: runs.url,
      finalUrl: runs.finalUrl,
      title: runs.title,
      status: runs.status,
      createdBy: runs.createdBy,
      createdAt: runs.createdAt,
      durationMs: runs.durationMs,
      device: runs.device,
      network: runs.network,
      stepCount: sql<number>`coalesce(jsonb_array_length(${runs.steps}), 0)`,
      input: runs.input,
    })
    .from(runs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(runs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100))

  const navs = rows.length
    ? await db
        .select()
        .from(navigations)
        .where(
          inArray(
            navigations.runId,
            rows.map((r) => r.id),
          ),
        )
    : []
  const items: RunListItem[] = rows.map((r) => {
    const own = navs.filter((n) => n.runId === r.id)
    const first = own.find((n) => n.position === 0)
    return {
      id: r.id,
      url: r.url,
      finalUrl: r.finalUrl ?? undefined,
      title: r.title ?? undefined,
      status: r.status,
      createdBy: r.createdBy ?? undefined,
      createdAt: r.createdAt.toISOString(),
      durationMs: r.durationMs ?? undefined,
      device: r.device,
      network: r.network,
      steps: Number(r.stepCount) || (r.input.steps?.length ?? 0) + 1,
      navigations: { hard: own.filter((n) => n.kind === 'hard').length, soft: own.filter((n) => n.kind === 'soft').length },
      initial: first ? { ttfb: first.ttfb ?? undefined, fcp: first.fcp ?? undefined, lcp: first.lcp ?? undefined, cls: first.cls ?? undefined } : undefined,
    }
  })
  return { runs: items, nextCursor: rows.length === limit ? items[items.length - 1].createdAt : undefined }
}

export async function getRunOwner(id: string) {
  const [row] = await getDb().select({ createdBy: runs.createdBy }).from(runs).where(eq(runs.id, id)).limit(1)
  return row ? { createdBy: row.createdBy } : null
}

export async function deleteRun(id: string) {
  const deleted = await getDb().delete(runs).where(eq(runs.id, id)).returning({ id: runs.id })
  return deleted.length > 0
}

export async function getAsset(id: string) {
  const [row] = await getDb().select({ mime: assets.mime, data: assets.data }).from(assets).where(eq(assets.id, id)).limit(1)
  return row ?? null
}
