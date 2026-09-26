import { hasDatabase } from '@/db'
import { isDenied, jsonError, requireAccess } from '@/lib/api'
import { resolveStepAssets } from '@/lib/object-storage'
import { assertPublicUrl } from '@/lib/scenario/guard'
import { inlineAssets, runScenario } from '@/lib/scenario/runner'
import { runInputSchema, type RunEvent, type RunSummary } from '@/lib/scenario/schema'
import { createRun, finishRun, listRuns, persistentAssetSink } from '@/lib/store'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Run a navigation scenario.
 * - JSON response by default.
 * - NDJSON progress stream with `?stream=1` or `Accept: application/x-ndjson`.
 */
export async function POST(req: Request) {
  const access = await requireAccess(req)
  if (isDenied(access)) return access

  const body = await req.json().catch(() => undefined)
  const parsed = runInputSchema.safeParse(body)
  if (!parsed.success) return jsonError('Invalid scenario', 400, { issues: z.treeifyError(parsed.error) })
  const input = parsed.data
  try {
    await assertPublicUrl(input.url)
  } catch (e) {
    return jsonError((e as Error).message, 400)
  }

  const id = crypto.randomUUID()
  let persist = hasDatabase()
  if (persist) {
    try {
      await createRun(id, body, input, access.actor)
    } catch (e) {
      console.error('[navprobe] could not create run record, continuing without persistence', e)
      persist = false
    }
  }

  const execute = async (emit: (e: RunEvent) => void, signal: AbortSignal) => {
    const run: RunSummary = await runScenario(input, { id, emit, signal, assets: persist ? persistentAssetSink(id) : inlineAssets })
    run.createdBy = access.actor
    if (persist) {
      try {
        await finishRun(run)
        run.persisted = true
      } catch (e) {
        console.error('[navprobe] could not save run', e)
      }
    }
    return run
  }

  const url = new URL(req.url)
  const stream = url.searchParams.get('stream') === '1' || (req.headers.get('accept') ?? '').includes('application/x-ndjson')
  if (!stream) {
    const run = await execute(() => {}, req.signal)
    const body = { ...run, steps: await resolveStepAssets(run.steps) }
    return Response.json(body, { status: run.status === 'ok' ? 200 : run.status === 'timeout' ? 504 : 502 })
  }

  const encoder = new TextEncoder()
  const abort = new AbortController()
  req.signal.addEventListener('abort', () => abort.abort(), { once: true })
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let closed = false
  // Step events carry `s3:` references that must be presigned (async) — a promise chain keeps events in order.
  let queue = Promise.resolve()
  const send = (event: RunEvent) => {
    queue = queue.then(async () => {
      if (closed) return
      const out = event.type === 'step' ? { ...event, step: (await resolveStepAssets([event.step]))[0] } : event
      try {
        controller.enqueue(encoder.encode(JSON.stringify(out) + '\n'))
      } catch {
        closed = true
      }
    })
  }
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      closed = true
      abort.abort()
    },
  })

  const heartbeat = setInterval(() => send({ type: 'heartbeat', t: Date.now() }), 10_000)
  void execute(send, abort.signal)
    .then((run) => {
      const { steps: _steps, ...rest } = run
      send({ type: 'done', run: rest })
    })
    .catch((e) => send({ type: 'error', message: e instanceof Error ? e.message : String(e) }))
    .then(() => queue)
    .finally(() => {
      clearInterval(heartbeat)
      if (!closed) controller.close()
      closed = true
    })

  return new Response(readable, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no', 'x-run-id': id },
  })
}

/** List recent runs: `?limit=20&before=<ISO date>&url=<exact url>` */
export async function GET(req: Request) {
  const access = await requireAccess(req)
  if (isDenied(access)) return access
  if (!hasDatabase()) return Response.json({ runs: [], persistence: false })
  const params = new URL(req.url).searchParams
  const result = await listRuns({
    limit: Number(params.get('limit') ?? 20) || 20,
    before: params.get('before') ?? undefined,
    url: params.get('url') ?? undefined,
    createdBy: params.get('mine') === '1' ? access.actor : undefined,
  })
  return Response.json({ ...result, persistence: true })
}
