import { StoredRun } from '@/components/stored-run'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Run report — NavProbe' }

export default async function RunPage({ params }: PageProps<'/runs/[id]'>) {
  const { id } = await params
  return <StoredRun id={id} />
}
