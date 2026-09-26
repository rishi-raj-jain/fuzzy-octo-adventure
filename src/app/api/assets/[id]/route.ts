import { hasDatabase } from '@/db'
import { jsonError } from '@/lib/api'
import { getAsset } from '@/lib/store'

export const runtime = 'nodejs'

// Asset ids are unguessable UUIDs, so these are served without the API key (they're used as <img src>).
export async function GET(_req: Request, ctx: RouteContext<'/api/assets/[id]'>) {
  if (!hasDatabase()) return jsonError('Persistence is not configured', 404)
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError('Not found', 404)
  const asset = await getAsset(id)
  if (!asset) return jsonError('Not found', 404)
  return new Response(Buffer.from(asset.data, 'base64'), { headers: { 'content-type': asset.mime, 'cache-control': 'public, max-age=31536000, immutable' } })
}
