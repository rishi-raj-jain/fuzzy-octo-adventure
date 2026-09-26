import { hasDatabase } from '@/db'
import { isDenied, jsonError, requireAccess } from '@/lib/api'
import { resolveStepAssets } from '@/lib/object-storage'
import { currentRegion, enabledRegions, isRegion, regionRunPath, type Region } from '@/lib/regions'
import { assertPublicUrl } from '@/lib/scenario/guard'
import { inlineAssets, runScenario } from '@/lib/scenario/runner'
import { runInputSchema, type RunEvent, type RunSummary } from '@/lib/scenario/schema'
import { createRun, finishRun, persistentAssetSink } from '@/lib/store'
import { z } from 'zod'

/**
 * POST handler shared by `/api/runs` and the per-region endpoints `/api/regions/<code>/runs`.
 *
 * `endpoint` is the region the calling route is pinned to. Without it (the default-region route), a run that
 * asks for another enabled region via `options.region` or `?region=` is redirected (307, so the body is re-sent)
 * to that region's endpoint.
 */
export async function runScenarioRequest(req: Request, endpoint?: Region) {
  const access = await requireAccess(req)
  if (isDenied(access)) return access

  const url = new URL(req.url)
  const body = await req.json().catch(() => undefined)
  const parsed = runInputSchema.safeParse(body)
  if (!parsed.success) return jsonError('Invalid scenario', 400, { issues: z.treeifyError(parsed.error) })
  const input = parsed.data

  const here = currentRegion()
  if (endpoint) {
    // A pinned endpoint that isn't in NAVPROBE_REGIONS is deployed to the default region: refuse rather than mislabel the run.
    if (process.env.VERCEL && here !== endpoint && here !== 'dev1') {
      const fix = enabledRegions().includes(endpoint)
        ? 'It is listed in NAVPROBE_REGIONS, but this deployment was built without it: redeploy (vercel.ts reads the variable at build time).'
        : 'Add it to NAVPROBE_REGIONS and redeploy.'
      return jsonError(`Region ${endpoint} is not enabled on this deployment (this function runs in ${here}). ${fix}`, 409, { enabledRegions: enabledRegions() })
    }
    input.options.region = endpoint
  } else {
    const requested = url.searchParams.get('region') ?? input.options.region
    if (requested && requested !== here) {
      if (!isRegion(requested)) return jsonError(`Unknown region "${requested}"`, 400)
      if (!enabledRegions().includes(requested)) {
        return jsonError(`Region ${requested} is not enabled on this deployment. Set NAVPROBE_REGIONS (e.g. "iad1,${requested}") and redeploy.`, 400, { enabledRegions: enabledRegions() })
      }
      const target = new URL(regionRunPath(requested), url)
      target.search = url.search
      target.searchParams.delete('region')
      return Response.redirect(target, 307)
    }
  }

  try {
    await assertPublicUrl(input.url)
  } catch (e) {
    return jsonError((e as Error).message, 400)
  }

  const id = crypto.randomUUID()
  let persist = hasDatabase()
  if (persist) {
    try {
      await createRun(id, body, input, access.actor, here)
    } catch (e) {
      console.error('[navprobe] could not create run record, continuing without persistence', e)
      persist = false
    }
  }

  const execute = async (emit: (e: RunEvent) => void, signal: AbortSignal) => {
    const run: RunSummary = await runScenario(input, { id, emit, signal, assets: persist ? persistentAssetSink(id) : inlineAssets })
    run.createdBy = access.actor
    run.region = here
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
