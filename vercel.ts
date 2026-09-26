import type { VercelConfig } from '@vercel/config/v1'
import { parseRegions } from './src/lib/regions'

/**
 * Pins each region's run endpoint to that region, for the regions listed in NAVPROBE_REGIONS (evaluated at
 * deploy time). Unset = every function stays in the project's default region.
 *
 * Plans limit how many regions a deployment may use (Hobby: 1, Pro: 5, Enterprise: all); the default region
 * counts too. Exceeding the limit fails the deployment before the build starts.
 */
const regions = parseRegions()

export const config: VercelConfig = regions.length ? { functions: Object.fromEntries(regions.map((region) => [`src/app/api/regions/${region}/runs/route.ts`, { regions: [region] }])) } : {}
