import { hasDatabase } from '@/db'
import { checkAuth, jsonError } from '@/lib/api'
import { deleteRun, getRun } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(req: Request, ctx: RouteContext<'/api/runs/[id]'>) {
  const unauthorized = checkAuth(req)
  if (unauthorized) return unauthorized
  if (!hasDatabase()) return jsonError('Persistence is not configured (DATABASE_URL is missing)', 404)
  const { id } = await ctx.params
  const run = await getRun(id)
  if (!run) return jsonError('Run not found', 404)
  return Response.json({ ...run.summary, running: run.running, input: run.input })
}

export async function DELETE(req: Request, ctx: RouteContext<'/api/runs/[id]'>) {
  const unauthorized = checkAuth(req)
  if (unauthorized) return unauthorized
  if (!hasDatabase()) return jsonError('Persistence is not configured (DATABASE_URL is missing)', 404)
  const { id } = await ctx.params
  return (await deleteRun(id)) ? new Response(null, { status: 204 }) : jsonError('Run not found', 404)
}
