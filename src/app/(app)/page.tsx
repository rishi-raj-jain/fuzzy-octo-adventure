import { NavProbeApp } from '@/components/navprobe-app'
import { Suspense } from 'react'

export default function Home() {
  return (
    <Suspense>
      <NavProbeApp />
    </Suspense>
  )
}
