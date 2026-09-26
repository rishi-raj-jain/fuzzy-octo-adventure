import { CompareView } from '@/components/compare/compare-view'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = { title: 'Compare runs — NavProbe' }

export default function ComparePage() {
  return (
    <Suspense>
      <CompareView />
    </Suspense>
  )
}
