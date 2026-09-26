import type { NextConfig } from 'next'
import { parseRegions } from './src/lib/regions'

// puppeteer-core and @sparticuz/chromium are external by default; ship the packed Chromium (~60 MB) only with the
// routes that launch it. Keys are matched as substrings of the app path, so '/api/runs/route' skips /api/runs/[id]/route.
const chromium = ['./node_modules/@sparticuz/chromium/bin/**']

const nextConfig: NextConfig = {
  outputFileTracingIncludes: Object.fromEntries(['/api/runs/route', ...parseRegions().map((region) => `/api/regions/${region}/runs/route`)].map((route) => [route, chromium])),
}

export default nextConfig
