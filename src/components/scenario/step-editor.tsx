'use client'

import { SimpleSelect } from '@/components/simple-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { newStep, SCRIPT_PRESETS, type DraftStep } from '@/lib/draft'
import { STEP_LABELS, type StepType } from '@/lib/scenario/schema'
import { ArrowDown, ArrowUp, Clock, Code2, Globe, Keyboard, MousePointerClick, ScanSearch, Trash2, Wifi } from 'lucide-react'
import type { ComponentType } from 'react'

export const STEP_ICONS: Record<StepType, ComponentType<{ className?: string }>> = {
  navigate: Globe,
  wait: Clock,
  script: Code2,
  click: MousePointerClick,
  type: Keyboard,
  waitForSelector: ScanSearch,
  waitForNetworkIdle: Wifi,
}

const SELECTOR_HINT = 'CSS selector, or Puppeteer syntax like ::-p-text(Sign in) or ::-p-aria(Submit)'

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function StepEditor({
  step,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  step: DraftStep
  index: number
  total: number
  onChange: (step: DraftStep) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  const Icon = STEP_ICONS[step.type]
  const fid = (name: string) => `${step.id}-${name}`
  const set = (patch: Partial<DraftStep>) => onChange({ ...step, ...patch } as DraftStep)

  return (
    <div className="group/step relative rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs text-muted-foreground">{index + 2}</span>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <SimpleSelect
          size="sm"
          className="h-7 w-auto min-w-40 border-none bg-transparent px-1 font-medium shadow-none dark:bg-transparent"
          value={step.type}
          options={STEP_LABELS}
          onChange={(type) => onChange({ ...newStep(type), id: step.id })}
        />
        <div className="ml-auto flex items-center gap-0.5 opacity-60 transition-opacity group-hover/step:opacity-100">
          <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Remove step" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {step.type === 'wait' && (
          <Field label="Seconds to wait" htmlFor={fid('seconds')}>
            <Input id={fid('seconds')} type="number" min={0} max={120} step={0.5} value={step.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} />
          </Field>
        )}

        {step.type === 'navigate' && (
          <Field label="URL" htmlFor={fid('url')}>
            <Input id={fid('url')} placeholder="https://example.com/pricing" value={step.url} onChange={(e) => set({ url: e.target.value })} />
          </Field>
        )}

        {step.type === 'script' && (
          <Field label="JavaScript to run in the page" htmlFor={fid('script')} hint="Runs in the page like the DevTools console. Top-level await is allowed; the last expression or a `return` value is captured.">
            <div className="flex flex-wrap gap-1">
              {SCRIPT_PRESETS.map((preset) => (
                <Button key={preset.label} variant="outline" size="xs" onClick={() => set({ script: preset.script })}>
                  {preset.label}
                </Button>
              ))}
            </div>
            <Textarea id={fid('script')} spellCheck={false} className="min-h-24 font-mono text-xs" value={step.script} onChange={(e) => set({ script: e.target.value })} />
          </Field>
        )}

        {(step.type === 'click' || step.type === 'type' || step.type === 'waitForSelector') && (
          <Field label="Selector" htmlFor={fid('selector')} hint={SELECTOR_HINT}>
            <Input id={fid('selector')} className="font-mono text-xs" placeholder="a[href='/pricing']" value={step.selector} onChange={(e) => set({ selector: e.target.value })} />
          </Field>
        )}

        {step.type === 'type' && (
          <>
            <Field label="Text" htmlFor={fid('text')}>
              <Input id={fid('text')} value={step.text} onChange={(e) => set({ text: e.target.value })} />
            </Field>
            <div className="flex items-center gap-2">
              <Switch id={fid('enter')} checked={step.pressEnter} onCheckedChange={(checked) => set({ pressEnter: checked })} />
              <Label htmlFor={fid('enter')} className="text-sm">
                Press Enter afterwards
              </Label>
            </div>
          </>
        )}

        {step.type === 'waitForNetworkIdle' && (
          <Field label="Idle for (ms)" htmlFor={fid('idle')}>
            <Input id={fid('idle')} type="number" min={0} max={10000} step={100} value={step.idleMs} onChange={(e) => set({ idleMs: Number(e.target.value) })} />
          </Field>
        )}

        {(step.type === 'click' || step.type === 'type' || step.type === 'waitForSelector' || step.type === 'waitForNetworkIdle') && (
          <Field label="Timeout (seconds)" htmlFor={fid('timeout')}>
            <Input id={fid('timeout')} type="number" min={0.1} max={120} value={step.timeoutSeconds} onChange={(e) => set({ timeoutSeconds: Number(e.target.value) })} />
          </Field>
        )}
      </div>
    </div>
  )
}
