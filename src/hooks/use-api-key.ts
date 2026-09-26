'use client'

import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'navprobe:api-key'
const listeners = new Set<() => void>()

function read() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function apiHeaders(apiKey: string): HeadersInit {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {}
}

export function useApiKey() {
  const apiKey = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => '',
  )
  const setApiKey = useCallback((value: string) => {
    try {
      if (value) localStorage.setItem(KEY, value)
      else localStorage.removeItem(KEY)
    } catch {}
    listeners.forEach((l) => l())
  }, [])
  return [apiKey, setApiKey] as const
}
