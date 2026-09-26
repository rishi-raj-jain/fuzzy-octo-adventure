import { hasDatabase } from '@/db'
import { authRequired } from '@/lib/api'
import { MAX_RUN_MS } from '@/lib/scenario/runner'
import { DEVICES, MAX_STEPS, MAX_WAIT_SECONDS, NETWORKS, WAIT_UNTIL } from '@/lib/scenario/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({
    ok: true,
    authRequired: authRequired(),
    persistence: hasDatabase(),
    limits: { maxRunSeconds: MAX_RUN_MS / 1000, maxSteps: MAX_STEPS, maxWaitSeconds: MAX_WAIT_SECONDS },
    devices: Object.keys(DEVICES),
    networks: Object.keys(NETWORKS),
    waitUntil: Object.keys(WAIT_UNTIL),
    stepTypes: ['navigate', 'wait', 'script', 'click', 'type', 'waitForSelector', 'waitForNetworkIdle'],
  })
}
