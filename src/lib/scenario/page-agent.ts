/**
 * Script injected into every document (via Page.addScriptToEvaluateOnNewDocument) before any page script runs.
 *
 * It keeps one record per navigation:
 *  - hard: the document itself (direct load, link click, form submit, location change…)
 *  - soft: same-document navigations (history.pushState / Navigation API) that change path or query
 *
 * Each record collects TTFB/FCP/LCP/CLS/INP/blocking time. Hard navigations use the native performance
 * entries; soft navigations are anchored to the interaction that caused them and use a DOM-paint heuristic
 * for FCP/LCP (browsers do not report those for same-document navigations). Records are pushed to Node
 * through the `__navprobeReport` binding, throttled, and flushed on pagehide so nothing is lost when the
 * document goes away.
 *
 * Kept as a plain string so the bundler never transforms it.
 */
export const REPORT_BINDING = '__navprobeReport'
export const FLUSH_FN = '__navprobeFlush'

export const PAGE_AGENT = `(() => {
  if (window.top !== window || window.__navprobe) return;
  Object.defineProperty(window, '__navprobe', { value: true });
  const P = performance;
  const now = () => P.now();
  const round = (v) => Math.round(v * 10) / 10;
  const docId = Math.random().toString(36).slice(2, 10);
  const recs = [];
  const dirty = new Set();
  let seq = 0, timer = 0, lastInput = null, softWatch = null;

  const describe = (el) => {
    if (!el || !el.tagName) return undefined;
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
    if (el.tagName === 'IMG' && el.currentSrc) s += ' ' + el.currentSrc.slice(0, 160);
    return s;
  };

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = 0; }
    const fn = window['${REPORT_BINDING}'];
    if (typeof fn !== 'function' || !dirty.size) return;
    const out = Array.from(dirty, (r) => r.data);
    dirty.clear();
    try { fn(JSON.stringify({ timeOrigin: P.timeOrigin, recs: out })); } catch (e) {}
  };
  Object.defineProperty(window, '${FLUSH_FN}', { value: flush });
  const touch = (r) => { dirty.add(r); if (!timer) timer = setTimeout(flush, 250); };

  const mk = (kind, start, extra) => {
    const r = { start, data: Object.assign({ id: docId + ':' + seq++, kind, url: location.href, start: round(start), cls: 0, tbt: 0, longTasks: 0 }, extra), clsCur: 0, clsFirst: 0, clsLast: 0, lcpSize: 0 };
    recs.push(r);
    touch(r);
    return r;
  };
  const recAt = (t) => { for (let i = recs.length - 1; i >= 0; i--) if (recs[i].start <= t) return recs[i]; return recs[0]; };
  const rel = (r, t) => round(t - r.start);
  const obs = (type, cb, opts) => { try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe(Object.assign({ type, buffered: true }, opts)); } catch (e) {} };

  const hard = mk('hard', 0, { trigger: 'document' });

  // ---- hard navigation timing ----
  const fillNav = () => {
    const n = P.getEntriesByType('navigation')[0];
    if (!n) return;
    const d = hard.data;
    d.ttfb = round(n.responseStart);
    if (n.domContentLoadedEventEnd) d.dcl = round(n.domContentLoadedEventEnd);
    if (n.loadEventEnd) d.load = round(n.loadEventEnd);
    d.navType = n.type;
    if (n.responseStatus) d.httpStatus = n.responseStatus;
    touch(hard);
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(fillNav, 0));
  addEventListener('load', () => setTimeout(fillNav, 0));
  fillNav();

  obs('paint', (e) => { if (e.name === 'first-contentful-paint') { hard.data.fcp = round(e.startTime); touch(hard); } });
  obs('largest-contentful-paint', (e) => {
    // Browsers only stop LCP on trusted input; scripted clicks don't count. Content painted after a soft
    // navigation belongs to that navigation, not to the document's LCP.
    const t = e.renderTime || e.startTime || e.loadTime;
    if (recs.length > 1 && t >= recs[1].start) return;
    hard.data.lcp = round(t);
    hard.data.lcpElement = describe(e.element) || (e.url ? e.url.slice(0, 160) : undefined);
    touch(hard);
  });

  // ---- metrics shared by hard + soft records (attributed by timestamp) ----
  obs('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    const r = recAt(e.startTime);
    if (r.clsCur && e.startTime - r.clsLast < 1000 && e.startTime - r.clsFirst < 5000) r.clsCur += e.value;
    else { r.clsCur = e.value; r.clsFirst = e.startTime; }
    r.clsLast = e.startTime;
    r.data.cls = Math.max(r.data.cls, Math.round(r.clsCur * 10000) / 10000);
    touch(r);
  });
  obs('longtask', (e) => {
    const r = recAt(e.startTime);
    r.data.longTasks++;
    r.data.tbt = round(r.data.tbt + Math.max(0, e.duration - 50));
    touch(r);
  });
  obs('event', (e) => {
    if (!e.interactionId) return;
    const r = recAt(e.startTime);
    if (r.data.inp == null || e.duration > r.data.inp) {
      r.data.inp = e.duration;
      r.data.inpTarget = (describe(e.target) || '?') + ' (' + e.name + ')';
      touch(r);
    }
  }, { durationThreshold: 16 });

  // ---- interactions (anchor for soft navigations) ----
  ['pointerdown', 'click', 'keydown', 'submit'].forEach((type) => addEventListener(type, (e) => {
    // A click/submit that follows a pointerdown is the same interaction: keep the earlier start time.
    const sameInteraction = lastInput && lastInput.type === 'pointerdown' && (e.type === 'click' || e.type === 'submit') && e.timeStamp - lastInput.t < 1000;
    lastInput = { t: sameInteraction ? lastInput.t : e.timeStamp, type: e.type, target: describe(e.target) };
    if (softWatch && e.timeStamp > softWatch.r.start + 100) softWatch.stop();
  }, { capture: true, passive: true }));

  // ---- soft navigation paint heuristic ----
  const visibleArea = (el) => {
    const b = el.getBoundingClientRect();
    const w = Math.min(b.right, innerWidth) - Math.max(b.left, 0);
    const h = Math.min(b.bottom, innerHeight) - Math.max(b.top, 0);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const isContentful = (el) => {
    const tag = el.tagName;
    if (tag === 'IMG' || tag === 'SVG' || tag === 'svg' || tag === 'VIDEO' || tag === 'CANVAS') return true;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };
  const watchSoft = (r) => {
    if (softWatch) softWatch.stop();
    let stopped = false, seen = 0;
    const consider = (el) => {
      if (el.tagName === 'IMG' && !el.complete) { el.addEventListener('load', () => consider(el), { once: true }); return; }
      requestAnimationFrame(() => setTimeout(() => {
        if (stopped || !el.isConnected) return;
        const area = visibleArea(el);
        if (!area) return;
        const t = rel(r, now());
        if (r.data.fcp == null) r.data.fcp = t;
        if (area > r.lcpSize) { r.lcpSize = area; r.data.lcp = t; r.data.lcpElement = describe(el); }
        touch(r);
      }, 0));
    };
    const scan = (node) => {
      if (node.nodeType === 3) { if (node.parentElement && node.textContent.trim()) consider(node.parentElement); return; }
      if (node.nodeType !== 1) return;
      if (isContentful(node)) consider(node);
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
      let el;
      while ((el = walker.nextNode()) && seen < 3000) { seen++; if (isContentful(el)) consider(el); }
    };
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') scan(m.target);
        else m.addedNodes.forEach(scan);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const onImg = (e) => { if (e.target && e.target.tagName === 'IMG') consider(e.target); };
    document.addEventListener('load', onImg, true);
    const stop = () => { if (stopped) return; stopped = true; mo.disconnect(); document.removeEventListener('load', onImg, true); clearTimeout(cap); if (softWatch && softWatch.r === r) softWatch = null; };
    const cap = setTimeout(stop, 15000);
    softWatch = { r, stop };
  };

  // ---- soft navigation detection ----
  let lastPath = location.pathname + location.search;
  const onSameDocNav = (how) => {
    const path = location.pathname + location.search;
    if (path === lastPath) return;
    lastPath = path;
    const t = now();
    const fromInput = lastInput && t - lastInput.t < 1000;
    // replaceState without user input is URL housekeeping (tracking params, canonical URLs), not a navigation.
    if (how === 'replace' && !fromInput) return;
    const start = fromInput ? lastInput.t : t;
    const r = mk('soft', start, { trigger: fromInput ? lastInput.type + (lastInput.target ? ' ' + lastInput.target : '') : how, navType: how, urlChangeAt: round(t - start) });
    watchSoft(r);
  };
  if (window.navigation && typeof navigation.addEventListener === 'function') {
    navigation.addEventListener('currententrychange', (e) => onSameDocNav(e.navigationType || 'push'));
  } else {
    ['pushState', 'replaceState'].forEach((m) => {
      const orig = history[m];
      history[m] = function () { const out = orig.apply(this, arguments); onSameDocNav(m === 'pushState' ? 'push' : 'replace'); return out; };
    });
    addEventListener('popstate', () => onSameDocNav('traverse'));
  }

  addEventListener('pagehide', flush, { capture: true });
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
})();`
