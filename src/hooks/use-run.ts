'use client'

import { apiFetch } from '@/lib/api-client'
import type { NavigationRecord, RunEvent, RunRequest, RunSummary, StepResult } from '@/lib/scenario/schema'
import { useCallback, useRef, useState } from 'react'

export interface LiveRun {
  id?: string
  url: string
  startedAt?: string
  plan: string[]
  activeStep?: number
  steps: StepResult[]
  navigations: NavigationRecord[]
  result?: RunSummary
  error?: string
  running: boolean
}

/** Starts a run against POST /api/runs?stream=1 and folds the NDJSON events into state. */
export function useRun() {
  const [run, setRun] = useState<LiveRun | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(async (request: RunRequest) => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setRun({ url: String(request.url), plan: [], steps: [], navigations: [], running: true })

    const apply = (event: RunEvent) =>
      setRun((prev) => {
        if (!prev) return prev
        switch (event.type) {
          case 'start':
            return { ...prev, id: event.id, url: event.url, startedAt: event.startedAt, plan: event.steps }
          case 'step-start':
            return { ...prev, activeStep: event.index }
          case 'step':
            return { ...prev, steps: [...prev.steps.filter((s) => s.index !== event.step.index), event.step].sort((a, b) => a.index - b.index) }
          case 'navigations':
            return { ...prev, navigations: event.navigations }
          case 'done':
            return { ...prev, running: false, activeStep: undefined, navigations: event.run.navigations, result: { ...event.run, steps: prev.steps } }
          case 'error':
            return { ...prev, running: false, activeStep: undefined, error: event.message }
          default:
            return prev
        }
      })

    try {
      const res = await apiFetch('/api/runs?stream=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
        body: JSON.stringify(request),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        const issues = body.issues ? ` ${JSON.stringify(body.issues)}` : ''
        throw new Error(`${body.error ?? `Request failed with ${res.status}`}${issues}`)
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as RunEvent)
      }
      setRun((prev) => (prev && prev.running ? { ...prev, running: false, error: prev.error ?? 'The connection closed before the run finished' } : prev))
    } catch (e) {
      const aborted = abort.signal.aborted
      setRun((prev) => (prev ? { ...prev, running: false, activeStep: undefined, error: aborted ? 'Cancelled' : (e as Error).message } : prev))
    }
  }, [])

  const cancel = useCallback(() => abortRef.current?.abort(), [])
  const reset = useCallback(() => {
    abortRef.current?.abort()
    setRun(null)
  }, [])

  return { run, start, cancel, reset }
}
