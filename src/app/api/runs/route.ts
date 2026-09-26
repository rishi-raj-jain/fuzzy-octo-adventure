import { hasDatabase } from '@/db'
import { isDenied, requireAccess } from '@/lib/api'
import { runScenarioRequest } from '@/lib/run-handler'
import { listRuns } from '@/lib/store'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Run a navigation scenario in the deployment's default region.
 * With `options.region` (or `?region=`) set to another enabled region, answers 307 to that region's endpoint.
 * - JSON response by default.
 * - NDJSON progress stream with `?stream=1` or `Accept: application/x-ndjson`.
 */
export function POST(req: Request) {
  return runScenarioRequest(req)
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
