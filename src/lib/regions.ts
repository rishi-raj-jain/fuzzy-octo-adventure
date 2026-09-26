/**
 * Vercel compute regions (https://vercel.com/docs/regions#region-list).
 *
 * Every region has its own run endpoint, `/api/regions/<code>/runs` (see scripts/generate-region-routes.mjs).
 * `vercel.ts` pins the endpoints listed in NAVPROBE_REGIONS to their region at deploy time; the rest stay
 * in the project's default region and refuse to run, so a run never claims a region it didn't execute in.
 */
export const REGIONS = {
  arn1: 'Stockholm, Sweden',
  bom1: 'Mumbai, India',
  cdg1: 'Paris, France',
  cle1: 'Cleveland, USA',
  cpt1: 'Cape Town, South Africa',
  dub1: 'Dublin, Ireland',
  fra1: 'Frankfurt, Germany',
  gru1: 'São Paulo, Brazil',
  hkg1: 'Hong Kong',
  hnd1: 'Tokyo, Japan',
  iad1: 'Washington, D.C., USA',
  icn1: 'Seoul, South Korea',
  kix1: 'Osaka, Japan',
  lhr1: 'London, United Kingdom',
  pdx1: 'Portland, USA',
  sfo1: 'San Francisco, USA',
  sin1: 'Singapore',
  syd1: 'Sydney, Australia',
  yul1: 'Montréal, Canada',
} as const

export type Region = keyof typeof REGIONS

export const REGION_CODES = Object.keys(REGIONS) as [Region, ...Region[]]

export const isRegion = (value: unknown): value is Region => typeof value === 'string' && value in REGIONS

/** "fra1 · Frankfurt, Germany", or the bare code for regions we don't know ("dev1", "local"). */
export const regionLabel = (code: string) => (isRegion(code) ? `${code} · ${REGIONS[code]}` : code)

/** Where this code is executing right now: the Vercel region, or "local" outside Vercel. */
export const currentRegion = () => process.env.VERCEL_REGION || 'local'

/**
 * Regions with a pinned run endpoint, from NAVPROBE_REGIONS (comma separated, e.g. "iad1,fra1,sin1").
 * Throws on unknown codes so a typo fails the deployment instead of silently running elsewhere.
 */
export function parseRegions(value = process.env.NAVPROBE_REGIONS): Region[] {
  const codes = [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  const unknown = codes.filter((c) => !isRegion(c))
  if (unknown.length) throw new Error(`NAVPROBE_REGIONS: unknown Vercel region(s) ${unknown.join(', ')}. Valid codes: ${REGION_CODES.join(', ')}`)
  return codes as Region[]
}

/** Like parseRegions, but never throws (for request handlers). */
export function enabledRegions(): Region[] {
  try {
    return parseRegions()
  } catch {
    return []
  }
}

export const regionRunPath = (region: Region) => `/api/regions/${region}/runs`
