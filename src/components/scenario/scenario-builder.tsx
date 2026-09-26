'use client'

import { STEP_ICONS, StepEditor } from '@/components/scenario/step-editor'
import { SimpleSelect } from '@/components/simple-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { encodeDraft, newStep, toRequest, type Draft } from '@/lib/draft'
import { DEVICES, MAX_STEPS, NETWORKS, STEP_LABELS, WAIT_UNTIL, type RunOptions, type StepType } from '@/lib/scenario/schema'
import { Check, Copy, Globe, Link2, Loader2, Play, Plus, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

const CPU = { '1': 'No throttling', '2': '2× slowdown', '4': '4× slowdown (mid-tier mobile)', '6': '6× slowdown (low-end mobile)' } as const
const DEVICE_LABELS = Object.fromEntries(Object.entries(DEVICES).map(([k, v]) => [k, v.label])) as Record<RunOptions['device'], string>

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : label}
    </Button>
  )
}

export function ScenarioBuilder({
  draft,
  onChange,
  onRun,
  onCancel,
  running,
  authRequired,
  apiKey,
  onApiKeyChange,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  onRun: () => void
  onCancel: () => void
  running: boolean
  authRequired: boolean
  apiKey: string
  onApiKeyChange: (key: string) => void
}) {
  const [headersText, setHeadersText] = useState(() =>
    Object.entries(draft.options.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
  )
  const setOptions = (patch: Partial<RunOptions>) => onChange({ ...draft, options: { ...draft.options, ...patch } })
  const updateStep = (index: number, step: Draft['steps'][number]) => onChange({ ...draft, steps: draft.steps.map((s, i) => (i === index ? step : s)) })
  const moveStep = (index: number, delta: -1 | 1) => {
    const steps = [...draft.steps]
    const [s] = steps.splice(index, 1)
    steps.splice(index + delta, 0, s)
    onChange({ ...draft, steps })
  }
  const addStep = (type: StepType) => onChange({ ...draft, steps: [...draft.steps, newStep(type)] })

  const totalWait = draft.steps.reduce((sum, s) => sum + (s.type === 'wait' ? s.seconds || 0 : 0), 0)
  const requestJson = useMemo(() => JSON.stringify(toRequest(draft), null, 2), [draft])
  const origin = typeof window === 'undefined' ? 'https://your-app.vercel.app' : window.location.origin
  const curl = `curl -X POST ${origin}/api/runs \\\n  -H 'content-type: application/json' \\\n${authRequired ? `  -H 'authorization: Bearer $NAVPROBE_API_KEY' \\\n` : ''}  -d '${JSON.stringify(toRequest(draft)).replace(/'/g, `'\\''`)}'`

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Scenario</CardTitle>
        <CardDescription>Load a page, wait, run code in it, and measure every navigation that follows.</CardDescription>
      </CardHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!running) onRun()
        }}
      >
        <CardContent className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="url">Page URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="url" className="h-9 pl-8" placeholder="https://example.com" value={draft.url} onChange={(e) => onChange({ ...draft, url: e.target.value })} autoComplete="url" />
              </div>
              {running ? (
                <Button type="button" variant="destructive" size="lg" onClick={onCancel}>
                  <Square /> Stop
                </Button>
              ) : (
                <Button type="submit" size="lg" disabled={!draft.url.trim()}>
                  <Play /> Run
                </Button>
              )}
            </div>
          </div>

          {authRequired && (
            <div className="grid gap-1.5">
              <Label htmlFor="api-key">API key</Label>
              <Input id="api-key" type="password" placeholder="Required by this deployment" value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)} />
            </div>
          )}

          <Tabs defaultValue="steps">
            <TabsList className="w-full">
              <TabsTrigger value="steps">Steps</TabsTrigger>
              <TabsTrigger value="options">Emulation</TabsTrigger>
              <TabsTrigger value="api">API</TabsTrigger>
            </TabsList>

            <TabsContent value="steps" className="grid gap-2 pt-2">
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs text-muted-foreground">1</span>
                <Globe className="size-4 text-muted-foreground" />
                <span className="font-medium">Load the page</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">waits for {WAIT_UNTIL[draft.options.waitUntil]}</span>
              </div>
              {draft.steps.map((step, i) => (
                <StepEditor
                  key={step.id}
                  step={step}
                  index={i}
                  total={draft.steps.length}
                  onChange={(s) => updateStep(i, s)}
                  onMove={(d) => moveStep(i, d)}
                  onRemove={() => onChange({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}
                />
              ))}
              <div className="grid gap-1.5 pt-1">
                <p className="text-xs text-muted-foreground">
                  <Plus className="inline size-3" /> Add a step {draft.steps.length >= MAX_STEPS && `(max ${MAX_STEPS})`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(STEP_LABELS) as StepType[]).map((type) => {
                    const Icon = STEP_ICONS[type]
                    return (
                      <Button key={type} type="button" variant="outline" size="sm" disabled={draft.steps.length >= MAX_STEPS} onClick={() => addStep(type)}>
                        <Icon /> {STEP_LABELS[type]}
                      </Button>
                    )
                  })}
                </div>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                {draft.steps.length + 1} steps · {totalWait}s of fixed waits
              </p>
            </TabsContent>

            <TabsContent value="options" className="grid gap-4 pt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="device">Device</Label>
                  <SimpleSelect id="device" value={draft.options.device} options={DEVICE_LABELS} onChange={(device) => setOptions({ device })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="network">Network</Label>
                  <SimpleSelect id="network" value={draft.options.network} options={NETWORKS} onChange={(network) => setOptions({ network })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cpu">CPU</Label>
                  <SimpleSelect
                    id="cpu"
                    value={String(draft.options.cpuThrottle) as keyof typeof CPU}
                    options={String(draft.options.cpuThrottle) in CPU ? CPU : { ...CPU, [String(draft.options.cpuThrottle)]: `${draft.options.cpuThrottle}× slowdown` }}
                    onChange={(v) => setOptions({ cpuThrottle: Number(v) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wait-until">Initial load is done at</Label>
                  <SimpleSelect id="wait-until" value={draft.options.waitUntil} options={WAIT_UNTIL} onChange={(waitUntil) => setOptions({ waitUntil })} />
                </div>
              </div>
              <Separator />
              <div className="grid gap-3">
                {(
                  [
                    ['screenshots', 'Screenshot after every step'],
                    ['filmstrip', 'Record a filmstrip (screen recording frames)'],
                    ['continueOnError', 'Keep going when a step fails'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <Label htmlFor={`opt-${key}`} className="font-normal">
                      {label}
                    </Label>
                    <Switch id={`opt-${key}`} checked={draft.options[key]} onCheckedChange={(checked) => setOptions({ [key]: checked })} />
                  </div>
                ))}
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label htmlFor="ua">User agent override</Label>
                <Input id="ua" placeholder="Default for the selected device" value={draft.options.userAgent ?? ''} onChange={(e) => setOptions({ userAgent: e.target.value || undefined })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="headers">Extra request headers</Label>
                <Textarea
                  id="headers"
                  className="min-h-16 font-mono text-xs"
                  placeholder={'Cookie: session=abc\nX-Feature-Flag: on'}
                  value={headersText}
                  onChange={(e) => {
                    setHeadersText(e.target.value)
                    const headers = Object.fromEntries(
                      e.target.value
                        .split('\n')
                        .map((line) => line.match(/^\s*([^:\s][^:]*):\s*(.*)$/))
                        .filter((m): m is RegExpMatchArray => Boolean(m))
                        .map((m) => [m[1].trim(), m[2].trim()]),
                    )
                    setOptions({ headers: Object.keys(headers).length ? headers : undefined })
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="api" className="grid gap-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Everything here is plain HTTP. Add <code className="rounded bg-muted px-1 font-mono text-xs">?stream=1</code> for NDJSON progress events.
              </p>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>cURL</Label>
                  <CopyButton text={curl} />
                </div>
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">{curl}</pre>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Request body</Label>
                  <CopyButton text={requestJson} />
                </div>
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">{requestJson}</pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </form>

      <div className="flex items-center gap-2 border-t px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            const link = `${window.location.origin}/#s=${encodeDraft(draft)}`
            await navigator.clipboard.writeText(link)
            toast.success('Scenario link copied')
          }}
        >
          <Link2 /> Share scenario
        </Button>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Running in a remote browser…
          </span>
        )}
      </div>
    </Card>
  )
}
