import { hasDatabase } from '@/db'
import { isDenied, jsonError, requireAccess } from '@/lib/api'
import { deleteRun, getRun, getRunOwner } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(req: Request, ctx: RouteContext<'/api/runs/[id]'>) {
  const access = await requireAccess(req)
  if (isDenied(access)) return access
  if (!hasDatabase()) return jsonError('Persistence is not configured (DATABASE_URL is missing)', 404)
  const { id } = await ctx.params
  const run = await getRun(id)
  if (!run) return jsonError('Run not found', 404)
  return Response.json({ ...run.summary, running: run.running, input: run.input })
}

/** Runs are visible to the whole team, but only their creator (or an API key) can delete them. */
export async function DELETE(req: Request, ctx: RouteContext<'/api/runs/[id]'>) {
  const access = await requireAccess(req)
  if (isDenied(access)) return access
  if (!hasDatabase()) return jsonError('Persistence is not configured (DATABASE_URL is missing)', 404)
  const { id } = await ctx.params
  const owner = await getRunOwner(id)
  if (!owner) return jsonError('Run not found', 404)
  if (access.kind === 'user' && owner.createdBy && owner.createdBy !== access.actor) return jsonError('Only the person who started this run can delete it', 403)
  await deleteRun(id)
  return new Response(null, { status: 204 })
}
