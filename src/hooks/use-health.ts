'use client'

import { useEffect, useState } from 'react'

export interface Health {
  auth: { mode: 'neon' | 'disabled' | 'misconfigured'; allowedDomains: string[]; apiKey: boolean }
  persistence: boolean
  limits: { maxRunSeconds: number; maxSteps: number; maxWaitSeconds: number }
}

export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null)
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])
  return health
}
