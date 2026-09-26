import { hasDatabase } from '@/db'
import { isDenied, jsonError, requireAccess } from '@/lib/api'
import { getAsset } from '@/lib/store'

export const runtime = 'nodejs'

// <img> requests carry the session cookie, so assets get the same protection as the rest of the API.
export async function GET(req: Request, ctx: RouteContext<'/api/assets/[id]'>) {
  const access = await requireAccess(req)
  if (isDenied(access)) return access
  if (!hasDatabase()) return jsonError('Persistence is not configured', 404)
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError('Not found', 404)
  const asset = await getAsset(id)
  if (!asset) return jsonError('Not found', 404)
  return new Response(Buffer.from(asset.data, 'base64'), { headers: { 'content-type': asset.mime, 'cache-control': 'private, max-age=31536000, immutable' } })
}
