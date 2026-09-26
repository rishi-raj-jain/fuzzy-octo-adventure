import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // puppeteer-core and @sparticuz/chromium are external by default; ship the packed Chromium (~60 MB) with the
  // run route only. Keys are matched as substrings of the app path, so this skips /api/runs/[id]/route.
  outputFileTracingIncludes: { '/api/runs/route': ['./node_modules/@sparticuz/chromium/bin/**'] },
}

export default nextConfig
