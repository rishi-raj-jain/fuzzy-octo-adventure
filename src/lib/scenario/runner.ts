import { createHash } from 'node:crypto'
import { PredefinedNetworkConditions, type Browser, type CDPSession, type Page } from 'puppeteer-core'
import { launchBrowser } from './browser'
import { assertPublicUrl } from './guard'
import { FLUSH_FN, PAGE_AGENT, REPORT_BINDING } from './page-agent'
import {
  describeStep,
  DEVICES,
  STEP_LABELS,
  type ConsoleEntry,
  type FrameRef,
  type NavigationRecord,
  type RequestEntry,
  type RunEvent,
  type RunInput,
  type RunStatus,
  type RunSummary,
  type Step,
  type StepResult,
} from './schema'

export const MAX_RUN_MS = Number(process.env.MAX_RUN_SECONDS || 270) * 1000
const NAV_TIMEOUT_MS = 60_000
const SCRIPT_TIMEOUT_MS = 60_000
const MAX_REQUESTS = 2000
const MAX_CONSOLE = 500
const MAX_FRAMES = 240
const FRAME_INTERVAL_MS = 150
const PASSIVE_STEPS = new Set<Step['type']>(['wait', 'waitForSelector', 'waitForNetworkIdle'])

/** Where screenshots/frames go. Returns the URL (or data: URL) the result should reference. */
export interface AssetSink {
  put(kind: 'screenshot' | 'frame', base64Jpeg: string): string
  flush(): Promise<void>
}

export const inlineAssets: AssetSink = { put: (_kind, b64) => `data:image/jpeg;base64,${b64}`, flush: async () => {} }

export interface RunHooks {
  id: string
  emit?: (event: RunEvent) => void
  signal?: AbortSignal
  assets?: AssetSink
}

interface RawNav {
  id: string
  kind: 'hard' | 'soft'
  url: string
  start: number
  trigger?: string
  urlChangeAt?: number
  ttfb?: number
  fcp?: number
  lcp?: number
  lcpElement?: string
  cls?: number
  inp?: number
  inpTarget?: string
  tbt?: number
  longTasks?: number
  dcl?: number
  load?: number
  navType?: string
  httpStatus?: number
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 1000)
const isNavigationInterruption = (e: unknown) => /context was destroyed|navigat|detached|Target closed|Cannot find context/i.test(errorMessage(e))

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'))
    const timer = setTimeout(resolve, Math.max(0, ms))
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Aborted'))
      },
      { once: true },
    )
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([promise, new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms)))]).finally(() => clearTimeout(timer))
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => unknown

/**
 * Wraps a user script so both expressions (`document.title`) and statement blocks (`const a = …; a.click()`)
 * work, `await` is allowed, and the return value comes back JSON-safe.
 */
export function buildUserScript(script: string) {
  const source = script.trim().replace(/;+\s*$/, '')
  let body = `return (\n${source}\n);`
  try {
    new AsyncFunction(body)
  } catch {
    body = script
  }
  return `(async () => {
  const __v = await (async () => {\n${body}\n})();
  if (__v === undefined) return undefined;
  if (typeof Node !== 'undefined' && __v instanceof Node) return { element: (__v.outerHTML || __v.textContent || '').slice(0, 2000) };
  try { return JSON.parse(JSON.stringify(__v)); } catch (e) { return String(__v); }
})()`
}

function clampReturnValue(v: unknown) {
  if (v === undefined) return undefined
  const json = JSON.stringify(v)
  return json && json.length > 20_000 ? `${json.slice(0, 20_000)}… (truncated)` : v
}

export async function runScenario(input: RunInput, { id, emit = () => {}, signal, assets = inlineAssets }: RunHooks): Promise<RunSummary> {
  const t0 = Date.now()
  const deadline = t0 + MAX_RUN_MS
  const rel = (epoch: number) => Math.round(epoch - t0)
  const remaining = () => deadline - Date.now()
  const { options } = input
  const plan: Step[] = [{ type: 'navigate', url: input.url, label: 'Initial load' }, ...input.steps]

  const requests = new Map<string, RequestEntry>()
  const consoleEntries: ConsoleEntry[] = []
  const rawNavs = new Map<string, { raw: RawNav; startEpoch: number }>()
  const urlChanges: { epoch: number; url: string; kind: 'document' | 'same-document'; stepIndex: number }[] = []
  const frameTimes: number[] = []
  const frameSteps: number[] = []
  const stepWindows: { start: number; end: number }[] = []
  const steps: StepResult[] = []
  let currentStep = 0
  let pendingFrames: { epoch: number; data: string }[] = []
  let pendingTail: { epoch: number; data: string } | null = null
  let keptFrames = 0
  let lastKeptAt = 0
  let redirects = 0
  let clockOffset: number | null = null
  let mainFrameId: string | undefined
  // Screenshots (and some repaints) emit frames without any pixel change; those encode to identical bytes.
  let lastFrameHash = ''

  let browser: Browser | undefined
  let status: RunStatus = 'ok'
  let error: string | undefined
  let finalUrl: string | undefined
  let title: string | undefined
  let browserVersion: string | undefined

  emit({ type: 'start', id, url: input.url, startedAt: new Date(t0).toISOString(), steps: plan.map(describeStep) })

  const onAbort = () => void browser?.close().catch(() => {})
  signal?.addEventListener('abort', onAbort, { once: true })

  const monoToEpoch = (ts: number) => (clockOffset === null ? Date.now() : ts * 1000 + clockOffset)

  function wireCdp(cdp: CDPSession) {
    cdp.on('Network.requestWillBeSent', (e) => {
      if (e.request.url.startsWith('data:') || e.request.url.startsWith('blob:')) return
      if (clockOffset === null) clockOffset = e.wallTime * 1000 - e.timestamp * 1000
      const at = rel(monoToEpoch(e.timestamp))
      const existing = requests.get(e.requestId)
      if (existing && e.redirectResponse) {
        requests.delete(e.requestId)
        requests.set(`${e.requestId}:r${++redirects}`, { ...existing, status: e.redirectResponse.status, protocol: e.redirectResponse.protocol, end: at, responseAt: existing.responseAt ?? at })
      }
      if (requests.size >= MAX_REQUESTS) return
      requests.set(e.requestId, { id: e.requestId, url: e.request.url.slice(0, 2000), method: e.request.method, resourceType: e.type ?? 'Other', stepIndex: currentStep, start: at })
    })
    cdp.on('Network.responseReceived', (e) => {
      const r = requests.get(e.requestId)
      if (!r) return
      r.status = e.response.status
      r.mimeType = e.response.mimeType
      r.protocol = e.response.protocol
      r.fromCache = Boolean(e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache)
      r.responseAt = rel(monoToEpoch(e.timestamp))
    })
    cdp.on('Network.loadingFinished', (e) => {
      const r = requests.get(e.requestId)
      if (!r) return
      r.end = rel(monoToEpoch(e.timestamp))
      r.bytes = Math.round(e.encodedDataLength)
    })
    cdp.on('Network.loadingFailed', (e) => {
      const r = requests.get(e.requestId)
      if (!r) return
      r.end = rel(monoToEpoch(e.timestamp))
      r.failed = e.canceled ? 'canceled' : e.blockedReason ? `blocked: ${e.blockedReason}` : e.errorText
    })
    cdp.on('Page.frameNavigated', (e) => {
      if (!e.frame.parentId && e.frame.url !== 'about:blank') urlChanges.push({ epoch: Date.now(), url: e.frame.url, kind: 'document', stepIndex: currentStep })
    })
    cdp.on('Page.navigatedWithinDocument', (e) => {
      if (e.frameId === mainFrameId) urlChanges.push({ epoch: Date.now(), url: e.url, kind: 'same-document', stepIndex: currentStep })
    })
    cdp.on('Page.screencastFrame', (e) => {
      cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {})
      const epoch = e.metadata.timestamp ? e.metadata.timestamp * 1000 : Date.now()
      const hash = createHash('sha1').update(e.data).digest('base64')
      if (hash === lastFrameHash) return
      lastFrameHash = hash
      if (frameTimes.length < 10_000) {
        frameTimes.push(epoch)
        frameSteps.push(currentStep)
      }
      if (!options.filmstrip || keptFrames >= MAX_FRAMES) return
      if (epoch - lastKeptAt >= FRAME_INTERVAL_MS) {
        pendingFrames.push({ epoch, data: e.data })
        keptFrames++
        lastKeptAt = epoch
        pendingTail = null
      } else {
        pendingTail = { epoch, data: e.data }
      }
    })
  }

  async function setupPage(b: Browser) {
    const p = await b.newPage()
    const device = DEVICES[options.device]
    await p.setViewport({ width: device.width, height: device.height, deviceScaleFactor: device.deviceScaleFactor, isMobile: device.isMobile, hasTouch: device.hasTouch })
    const ua = options.userAgent || (options.device === 'iphone' ? IPHONE_UA : options.device === 'android' ? ANDROID_UA : undefined)
    if (ua) await p.setUserAgent({ userAgent: ua })
    if (options.headers && Object.keys(options.headers).length) await p.setExtraHTTPHeaders(options.headers)
    if (options.network !== 'none') await p.emulateNetworkConditions(PredefinedNetworkConditions[options.network])
    if (options.cpuThrottle > 1) await p.emulateCPUThrottling(options.cpuThrottle)
    p.setDefaultTimeout(30_000)

    await p.exposeFunction(REPORT_BINDING, (payload: string) => {
      try {
        const { timeOrigin, recs } = JSON.parse(payload) as { timeOrigin: number; recs: RawNav[] }
        for (const raw of recs) if (/^https?:/.test(raw.url)) rawNavs.set(raw.id, { raw, startEpoch: timeOrigin + raw.start })
      } catch {}
    })
    await p.evaluateOnNewDocument(PAGE_AGENT)

    p.on('console', (m) => {
      if (consoleEntries.length < MAX_CONSOLE) consoleEntries.push({ t: rel(Date.now()), level: m.type(), text: m.text().slice(0, 2000), stepIndex: currentStep })
    })
    p.on('pageerror', (err) => {
      if (consoleEntries.length < MAX_CONSOLE) consoleEntries.push({ t: rel(Date.now()), level: 'pageerror', text: errorMessage(err), stepIndex: currentStep })
    })
    p.on('dialog', (d) => {
      if (consoleEntries.length < MAX_CONSOLE) consoleEntries.push({ t: rel(Date.now()), level: 'dialog', text: `${d.type()}: ${d.message()}`.slice(0, 2000), stepIndex: currentStep })
      ;(d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {})
    })

    const cdp = await p.createCDPSession()
    wireCdp(cdp)
    await cdp.send('Page.enable')
    await cdp.send('Network.enable')
    mainFrameId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id
    // Always on: frames are only emitted when pixels change, which drives the visual-change metrics
    // even when the filmstrip images themselves are not kept.
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 45, maxWidth: 480, maxHeight: 480, everyNthFrame: 1 })
    return p
  }

  async function executeStep(p: Page, step: Step): Promise<{ note?: string; returnValue?: unknown }> {
    switch (step.type) {
      case 'navigate': {
        await assertPublicUrl(step.url)
        const res = await p.goto(step.url, { waitUntil: options.waitUntil, timeout: Math.min(NAV_TIMEOUT_MS, remaining()) })
        return { note: res ? `HTTP ${res.status()}` : undefined }
      }
      case 'wait':
        await sleep(Math.min(step.seconds * 1000, remaining()), signal)
        return {}
      case 'script': {
        const value = await withTimeout(p.evaluate(buildUserScript(step.script)), Math.min(SCRIPT_TIMEOUT_MS, remaining()), 'Script')
        return { returnValue: clampReturnValue(value) }
      }
      case 'click':
        await p
          .locator(step.selector)
          .setTimeout(Math.min(step.timeoutSeconds * 1000, remaining()))
          .click()
        return {}
      case 'type':
        await p
          .locator(step.selector)
          .setTimeout(Math.min(step.timeoutSeconds * 1000, remaining()))
          .click()
        await p.keyboard.type(step.text, { delay: 20 })
        if (step.pressEnter) await p.keyboard.press('Enter')
        return {}
      case 'waitForSelector':
        await p.waitForSelector(step.selector, { visible: true, timeout: Math.min(step.timeoutSeconds * 1000, remaining()) })
        return {}
      case 'waitForNetworkIdle':
        await p.waitForNetworkIdle({ idleTime: step.idleMs, timeout: Math.min(step.timeoutSeconds * 1000, remaining()) })
        return {}
    }
  }

  function collectFrames(): FrameRef[] {
    if (pendingTail) {
      pendingFrames.push(pendingTail)
      keptFrames++
      pendingTail = null
    }
    const out = pendingFrames.map((f) => ({ t: rel(f.epoch), src: assets.put('frame', f.data) }))
    pendingFrames = []
    return out
  }

  function buildNavigations(runEnd: number): NavigationRecord[] {
    const sorted = [...rawNavs.values()].sort((a, b) => a.startEpoch - b.startEpoch)
    const reqs = [...requests.values()]
    return sorted.map(({ raw, startEpoch }, i) => {
      const endEpoch = sorted[i + 1]?.startEpoch ?? runEnd
      let stepIndex = 0
      stepWindows.forEach((w, idx) => {
        if (w.start <= startEpoch + 1) stepIndex = idx
      })
      // Pixels that change once the next interaction starts (hover, focus, scroll…) are not part of this navigation.
      const nextAction = stepWindows.findIndex((w, idx) => idx > stepIndex && w.start > startEpoch && !PASSIVE_STEPS.has(plan[idx].type))
      const visualEnd = Math.min(endEpoch, nextAction === -1 ? runEnd : stepWindows[nextAction].start)
      const inWindow = reqs.filter((r) => r.start >= rel(startEpoch) - 5 && r.start < rel(endEpoch))
      const visualFrom = startEpoch + (raw.kind === 'hard' ? (raw.ttfb ?? 0) : 0)
      const frames = frameTimes.filter((f) => f >= visualFrom && f < visualEnd)
      const step = plan[stepIndex]
      const isInitial = i === 0 && raw.kind === 'hard'
      const trigger =
        raw.kind === 'soft' ? raw.trigger : isInitial ? 'initial load' : `${step ? STEP_LABELS[step.type] : 'document'} (step ${stepIndex + 1})${raw.navType && raw.navType !== 'navigate' ? ` · ${raw.navType}` : ''}`
      return {
        id: raw.id,
        kind: raw.kind,
        url: raw.url,
        stepIndex,
        startedAt: rel(startEpoch),
        trigger,
        urlChangeAt: raw.urlChangeAt,
        lcpElement: raw.lcpElement,
        inpTarget: raw.inpTarget,
        navType: raw.navType,
        httpStatus: raw.httpStatus,
        vitals: {
          ttfb: raw.ttfb,
          fcp: raw.fcp,
          lcp: raw.lcp,
          cls: raw.cls,
          inp: raw.inp,
          tbt: raw.tbt,
          longTasks: raw.longTasks,
          dcl: raw.dcl,
          load: raw.load,
          firstVisualChange: frames.length ? Math.round(frames[0] - startEpoch) : undefined,
          visuallyComplete: frames.length ? Math.round(frames[frames.length - 1] - startEpoch) : undefined,
        },
        requests: inWindow.length,
        bytes: inWindow.reduce((s, r) => s + (r.bytes ?? 0), 0),
      }
    })
  }

  const flushAgent = async (p: Page) => {
    await p.evaluate(`window.${FLUSH_FN} && window.${FLUSH_FN}()`).catch(() => {})
  }

  try {
    browser = await launchBrowser()
    browserVersion = await browser.version()
    const page = await setupPage(browser)

    for (let i = 0; i < plan.length; i++) {
      if (signal?.aborted) {
        status = 'aborted'
        break
      }
      if (remaining() < 1000) {
        status = 'timeout'
        error = `Run exceeded the ${Math.round(MAX_RUN_MS / 1000)}s limit`
        break
      }
      const step = plan[i]
      const summary = describeStep(step)
      currentStep = i
      emit({ type: 'step-start', index: i, summary })

      const startEpoch = Date.now()
      stepWindows[i] = { start: startEpoch, end: startEpoch }
      const urlBefore = page.url()
      let stepError: string | undefined
      let note: string | undefined
      let returnValue: unknown
      try {
        ;({ note, returnValue } = await executeStep(page, step))
      } catch (e) {
        if (signal?.aborted) throw e
        if ((step.type === 'script' || step.type === 'click') && isNavigationInterruption(e)) note = 'The page navigated while this step ran'
        else stepError = errorMessage(e)
      }
      const endEpoch = Date.now()
      stepWindows[i].end = endEpoch

      await flushAgent(page)
      let screenshot: string | undefined
      if (options.screenshots) {
        const b64 = await withTimeout(page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' }), 10_000, 'Screenshot').catch(() => undefined)
        if (b64) screenshot = assets.put('screenshot', b64 as string)
      }

      const stepRequests = [...requests.values()].filter((r) => r.stepIndex === i)
      const ends = stepRequests.map((r) => r.end).filter((v): v is number => v !== undefined)
      const stepUrlChanges = urlChanges.filter((c) => c.stepIndex === i)
      const docChange = stepUrlChanges.find((c) => c.kind === 'document')
      const visualFrom = docChange?.epoch ?? startEpoch
      const stepFrames = frameTimes.filter((f, idx) => frameSteps[idx] === i && f >= visualFrom)

      const result: StepResult = {
        index: i,
        type: step.type,
        summary,
        status: stepError ? 'error' : 'ok',
        error: stepError,
        note,
        startedAt: rel(startEpoch),
        durationMs: endEpoch - startEpoch,
        urlBefore,
        urlAfter: page.url(),
        returnValue,
        urlChanges: stepUrlChanges.map((c) => ({ t: c.epoch - startEpoch, url: c.url, kind: c.kind })),
        metrics: {
          requests: stepRequests.length,
          bytes: stepRequests.reduce((s, r) => s + (r.bytes ?? 0), 0),
          failedRequests: stepRequests.filter((r) => r.failed || (r.status ?? 0) >= 400).length,
          networkSettled: ends.length ? Math.max(...ends) - rel(startEpoch) : undefined,
          firstVisualChange: stepFrames.length ? Math.round(stepFrames[0] - startEpoch) : undefined,
          lastVisualChange: stepFrames.length ? Math.round(stepFrames[stepFrames.length - 1] - startEpoch) : undefined,
        },
        screenshot,
        frames: collectFrames(),
      }
      steps.push(result)
      await assets.flush()
      emit({ type: 'step', step: result })
      emit({ type: 'navigations', navigations: buildNavigations(Date.now()) })

      if (stepError && !options.continueOnError) {
        status = 'error'
        error = `Step ${i + 1} (${summary}) failed: ${stepError}`
        break
      }
    }

    finalUrl = page.url()
    title = await withTimeout(page.title(), 5000, 'title').catch(() => undefined)
    await flushAgent(page)
  } catch (e) {
    status = signal?.aborted ? 'aborted' : 'error'
    error = signal?.aborted ? 'Run was cancelled' : errorMessage(e)
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await browser?.close().catch(() => {})
  }

  const runEnd = Date.now()
  for (let i = steps.length; i < plan.length; i++) {
    const skipped: StepResult = {
      index: i,
      type: plan[i].type,
      summary: describeStep(plan[i]),
      status: 'skipped',
      startedAt: rel(runEnd),
      durationMs: 0,
      urlChanges: [],
      metrics: { requests: 0, bytes: 0, failedRequests: 0 },
      frames: [],
    }
    steps.push(skipped)
    emit({ type: 'step', step: skipped })
  }
  await assets.flush().catch(() => {})

  const requestList = [...requests.values()].sort((a, b) => a.start - b.start)
  const navigations = buildNavigations(runEnd)
  const summary: RunSummary = {
    id,
    url: input.url,
    finalUrl,
    title,
    status,
    error,
    startedAt: new Date(t0).toISOString(),
    durationMs: runEnd - t0,
    browserVersion,
    options,
    steps,
    navigations,
    requests: requestList,
    console: consoleEntries,
    totals: {
      requests: requestList.length,
      bytes: requestList.reduce((s, r) => s + (r.bytes ?? 0), 0),
      failedRequests: requestList.filter((r) => r.failed || (r.status ?? 0) >= 400).length,
      navigations: navigations.length,
      hardNavigations: navigations.filter((n) => n.kind === 'hard').length,
      softNavigations: navigations.filter((n) => n.kind === 'soft').length,
    },
    persisted: false,
  }
  return summary
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
