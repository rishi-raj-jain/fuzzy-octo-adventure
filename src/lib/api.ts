import { timingSafeEqual } from 'node:crypto'

export const authRequired = () => Boolean(process.env.NAVPROBE_API_KEY)

/** Returns a 401 response when NAVPROBE_API_KEY is set and the request doesn't carry it. */
export function checkAuth(req: Request): Response | null {
  const key = process.env.NAVPROBE_API_KEY
  if (!key) return null
  const provided = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(key)
  if (a.length === b.length && timingSafeEqual(a, b)) return null
  return Response.json({ error: 'Unauthorized: pass the API key as `Authorization: Bearer <key>` or `x-api-key`.' }, { status: 401 })
}

export const jsonError = (error: string, status: number, extra?: object) => Response.json({ error, ...extra }, { status })
