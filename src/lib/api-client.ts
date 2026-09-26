'use client'

/** fetch() for our own API: the session cookie authenticates; an expired session sends the user to /login. */
export async function apiFetch(input: string, init?: RequestInit) {
  const res = await fetch(input, { ...init, credentials: 'same-origin' })
  if (res.status === 401 && typeof window !== 'undefined') {
    const next = window.location.pathname + window.location.search
    window.location.assign(`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`)
  }
  return res
}
