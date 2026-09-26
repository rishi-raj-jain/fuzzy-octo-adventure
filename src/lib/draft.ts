import { optionsSchema, type RunOptions, type RunRequest, type Step, type StepType } from '@/lib/scenario/schema'

export type DraftStep = Step & { id: string }

export interface Draft {
  url: string
  steps: DraftStep[]
  options: RunOptions
}

const uid = () => Math.random().toString(36).slice(2, 10)

export function newStep(type: StepType): DraftStep {
  const id = uid()
  switch (type) {
    case 'navigate':
      return { id, type, url: '' }
    case 'wait':
      return { id, type, seconds: 3 }
    case 'script':
      return { id, type, script: SCRIPT_PRESETS[0].script }
    case 'click':
      return { id, type, selector: '', timeoutSeconds: 30 }
    case 'type':
      return { id, type, selector: '', text: '', pressEnter: false, timeoutSeconds: 30 }
    case 'waitForSelector':
      return { id, type, selector: '', timeoutSeconds: 30 }
    case 'waitForNetworkIdle':
      return { id, type, idleMs: 500, timeoutSeconds: 30 }
  }
}

export const withIds = (steps: Step[]): DraftStep[] => steps.map((s) => ({ ...s, id: uid() }) as DraftStep)

export function defaultDraft(): Draft {
  return {
    url: '',
    // Stable ids: this draft is also rendered on the server.
    steps: [{ ...newStep('wait'), id: 'default-1', seconds: 3 } as DraftStep, { ...newStep('script'), id: 'default-2' }, { ...newStep('wait'), id: 'default-3', seconds: 5 } as DraftStep],
    options: optionsSchema.parse({}),
  }
}

export function toRequest(draft: Draft): RunRequest {
  return { url: draft.url, steps: draft.steps.map(({ id: _id, ...step }) => step), options: draft.options }
}

export function fromRequest(request: Partial<RunRequest> & { url?: unknown }): Draft {
  const base = defaultDraft()
  const steps: Step[] = request.steps?.length
    ? (request.steps as Step[])
    : [
        ...(request.wait ? [{ type: 'wait', seconds: request.wait } as Step] : []),
        ...(request.script ? [{ type: 'script', script: request.script } as Step] : []),
        ...(request.wait !== undefined || request.script ? [{ type: 'wait', seconds: request.settle ?? 3 } as Step] : []),
      ]
  return {
    url: typeof request.url === 'string' ? request.url : '',
    steps: steps.length ? withIds(steps) : base.steps,
    options: optionsSchema.parse(request.options ?? {}),
  }
}

export function encodeDraft(draft: Draft) {
  const bytes = new TextEncoder().encode(JSON.stringify(toRequest(draft)))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function decodeDraft(encoded: string): Draft | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
    return fromRequest(JSON.parse(json))
  } catch {
    return null
  }
}

export const SCRIPT_PRESETS = [
  { label: 'Click first internal link', script: `document.querySelector('a[href^="/"]:not([href="/"])')?.click()` },
  { label: 'Click link/button by text', script: `[...document.querySelectorAll('a, button')]\n  .find((el) => el.textContent.trim() === 'Pricing')\n  ?.click()` },
  { label: 'Scroll to bottom', script: `window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })` },
  { label: 'Submit first form', script: `document.querySelector('form')?.requestSubmit()` },
  { label: 'Go back', script: `history.back()` },
  { label: 'Read page info', script: `({\n  title: document.title,\n  url: location.href,\n  links: document.links.length,\n  h1: document.querySelector('h1')?.textContent?.trim(),\n})` },
  {
    label: 'Wait for element, then click',
    script: `await new Promise((resolve) => {\n  const check = () => (document.querySelector('#load-more') ? resolve() : setTimeout(check, 100))\n  check()\n})\ndocument.querySelector('#load-more').click()`,
  },
]
