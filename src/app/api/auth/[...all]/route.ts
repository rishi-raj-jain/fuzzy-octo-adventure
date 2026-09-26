import { jsonError } from '@/lib/api'
import { authMode, getAuth } from '@/lib/auth/server'

export const runtime = 'nodejs'

const handle = (req: Request) => (authMode() === 'google' ? getAuth().handler(req) : jsonError('Google sign-in is not configured', 503))

export const GET = handle
export const POST = handle
