# NavProbe

Scripted navigation testing with Web Vitals for every page load, in the spirit of WebPageTest scripting.

You give it a URL and a list of steps: wait _n_ seconds, run JavaScript in the page, click, type, wait for a selector, navigate. It runs them in a real headless Chromium (Puppeteer) and reports:

- **Vitals for every navigation.** This covers the initial load, full page loads triggered by a click, script or form (**hard** navigations), and client-side route changes (**soft** navigations, via `history.pushState` or the Navigation API). Each navigation gets TTFB, FCP, LCP, CLS, INP, blocking time (TBT), DCL and load, plus first visual change and visually complete taken from the screen recording.
- **Screenshots** after every step, and a **filmstrip** with a frame for every visual change.
- A **request waterfall** grouped by step, the **console log** (including page errors and dialogs), each script's **return value**, and the URL changes seen in each step.
- **Emulation** of device (desktop, iPhone, Android), network (Fast 4G through Slow 3G), CPU throttling, user agent and extra headers.
- **History** in Neon Postgres (Drizzle ORM). Every run gets a permalink, and navigations are stored as rows so you can query vitals over time.
- **Google sign-in** (Better Auth), limited to allowed email domains (`@launchfa.st` and `@neon.com` by default). Programmatic clients use an API key instead.
- **Responsive UI** from 320 px phones to wide desktops, with larger touch targets on touch devices.

The UI (Next.js App Router + shadcn/ui) is a thin client over the HTTP API, so anything you can do in the browser you can also do with `curl`.

## Quick start

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL, and the Google/Better Auth variables to test sign-in
npm run db:migrate                # creates the tables in your Neon database
npm run dev
```

Without Google credentials, `next dev` runs with sign-in **turned off** (the header shows an "Auth off (dev)" badge). Production refuses all access until sign-in is configured.

Locally, the app uses `CHROME_EXECUTABLE_PATH` or the first Chrome/Chromium it finds (macOS Chrome, `/usr/bin/google-chrome`, Playwright's browsers, …). On Vercel it uses [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium).

## Deploying to Vercel

1. Import the repo in Vercel.
2. Add a Neon database (Storage → Neon, or the Neon integration). It sets `DATABASE_URL` for you.
3. Run the migrations once against that database: `DATABASE_URL=... npm run db:migrate`.
4. Set up Google sign-in (below).
5. Optional: set `NAVPROBE_API_KEY` to allow API access without a browser session (scripts, CI).

### Google sign-in

1. In the Google Cloud Console, open **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
2. Add an authorized redirect URI for every origin you'll sign in from:
   - `https://<your-domain>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` for local development
3. In Vercel, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), and `BETTER_AUTH_URL` (your production URL, e.g. `https://navprobe.vercel.app`).
4. Optional: change who can sign in with `ALLOWED_EMAIL_DOMAINS` (comma separated). The default is `launchfa.st,neon.com`.

How access is enforced:

- **New accounts:** Google must report the email as verified, and its domain must exactly match an allowed domain. `a@neon.com` is allowed. `a@sub.neon.com` and `a@neon.com.evil.dev` are not.
- **Every sign-in** re-checks the domain. If you remove a domain from `ALLOWED_EMAIL_DOMAINS`, its users are locked out at their next sign-in, and every request also re-checks the session user's email.
- Rejected users land back on `/login` with an explanation.
- **Pages:** `src/proxy.ts` sends signed-out visitors to `/login`.
- **API routes:** these need either a session or `NAVPROBE_API_KEY`. That includes screenshots under `/api/assets/*`.
- **Team history:** runs are shared across the team. Each run records who started it, and only that person (or an API key) can delete it.

`/api/runs` exports `maxDuration = 300`, and the runner stops scheduling steps after `MAX_RUN_SECONDS` (default 270) so there's time to save the results. If your plan allows longer functions, raise both. Chromium wants about 1.5 GB of memory; Vercel's default function memory is enough.

`next.config.ts` adds the packed Chromium to the `/api/runs` function only, via `outputFileTracingIncludes`.

### Environment variables

| Variable                 | Purpose                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Neon connection string. Without it runs still work, but nothing is saved and images are inlined as data URLs. |
| `GOOGLE_CLIENT_ID`       | Google OAuth client ID (required in production).                                                              |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth client secret (required in production).                                                          |
| `BETTER_AUTH_SECRET`     | Secret that signs sessions: `openssl rand -base64 32` (required in production).                               |
| `BETTER_AUTH_URL`        | Public URL of the app. Defaults to Vercel's production URL, or the request origin.                            |
| `ALLOWED_EMAIL_DOMAINS`  | Comma-separated email domains allowed to sign in (default `launchfa.st,neon.com`).                            |
| `NAVPROBE_API_KEY`       | Lets programmatic clients call the API with `Authorization: Bearer <key>` or `x-api-key: <key>`.              |
| `MAX_RUN_SECONDS`        | Hard cap per run (default 270). Keep it below the route's `maxDuration`.                                      |
| `ALLOW_PRIVATE_NETWORKS` | `true` allows localhost and private IPs as targets (always allowed in `next dev`).                            |
| `CHROME_EXECUTABLE_PATH` | Local Chrome/Chromium binary to use instead of auto-detection.                                                |
| `CHROME_PROXY_SERVER`    | Send the local browser through an HTTP proxy.                                                                 |

## API

### `POST /api/runs`: run a scenario

```bash
curl -X POST https://your-app.vercel.app/api/runs \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $NAVPROBE_API_KEY" \
  -d '{
    "url": "https://nextjs.org",
    "steps": [
      { "type": "wait", "seconds": 2 },
      { "type": "script", "script": "document.querySelector(\"a[href=\\\"/docs\\\"]\").click()" },
      { "type": "wait", "seconds": 4 }
    ],
    "options": { "device": "iphone", "network": "Fast 4G", "cpuThrottle": 4 }
  }'
```

There's also a shorthand for the most common case: load the page, wait, run a script, let things settle.

```json
{ "url": "https://example.com", "wait": 3, "script": "document.querySelector('a').click()", "settle": 5 }
```

This expands to `wait 3s → run script → wait 5s` (`settle` defaults to 3).

**Steps.** Step 1 is always the initial load of `url`.

| type                 | fields                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `wait`               | `seconds` (0–120)                                                                                |
| `script`             | `script`: JS run in the page, top-level `await` allowed, last expression/`return` value captured |
| `click`              | `selector`, `timeoutSeconds`                                                                     |
| `type`               | `selector`, `text`, `pressEnter`, `timeoutSeconds`                                               |
| `waitForSelector`    | `selector`, `timeoutSeconds`                                                                     |
| `waitForNetworkIdle` | `idleMs`, `timeoutSeconds`                                                                       |
| `navigate`           | `url`                                                                                            |

Selectors are Puppeteer selectors. Plain CSS works, and so do `::-p-text(Sign in)`, `::-p-aria(Submit)` and `::-p-xpath(...)`. Any step can also carry a `label`.

**Options** (all optional): `device` (`desktop`, `desktop-hd`, `iphone`, `android`), `network` (`none`, `Fast 4G`, `Slow 4G`, `Fast 3G`, `Slow 3G`), `cpuThrottle` (1–20), `waitUntil` for the initial load (`load`, `domcontentloaded`, `networkidle2`, `networkidle0`), `screenshots`, `filmstrip`, `continueOnError`, `userAgent`, `headers`.

**Responses.**

- By default the endpoint waits for the run to finish and returns the whole run as JSON. The status is 200 when the run succeeded, 502 when a step failed and 504 on timeout.
- With `?stream=1` or `Accept: application/x-ndjson` it streams NDJSON events: `start`, `step-start`, `step`, `navigations`, `heartbeat`, then a final `done` (or `error`). The UI uses this mode.

When a database is configured, screenshots and frames come back as `/api/assets/<id>` URLs, so responses stay small.

### Other endpoints

| Method & path          | Description                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /api/runs`        | Recent runs (`?limit=20&before=<ISO date>&url=<exact url>&mine=1`), with the initial load's vitals.     |
| `GET /api/runs/:id`    | The full stored run: steps, navigations, requests, console, the original input and who started it.      |
| `DELETE /api/runs/:id` | Deletes a run and its images (creator or API key only).                                                 |
| `GET /api/assets/:id`  | A stored screenshot or frame (same auth as the rest of the API).                                        |
| `GET /api/health`      | Public. Auth mode and allowed domains, whether persistence is on, limits, and the accepted enum values. |
| `/api/auth/*`          | Better Auth endpoints (Google sign-in, session, sign-out).                                              |

## How navigations are measured

Before any page script runs, a small agent (`src/lib/scenario/page-agent.ts`) is injected into **every document**. It keeps one record per navigation and streams it to Node through a CDP binding. It also flushes on `pagehide`, so a page that navigates away still reports its numbers.

- **Hard navigations** use the browser's own entries: Navigation Timing (TTFB, DCL, load), `paint` (FCP), `largest-contentful-paint`, `layout-shift` (CLS, largest session window), `event` (INP) and `longtask` (TBT).
- **Soft navigations** start when a same-document navigation changes the path or query (Navigation API `currententrychange`, with a `pushState`/`popstate` fallback). The start is anchored to the interaction that caused it: a pointerdown, click, keydown or submit within 1 s before the URL change. Browsers don't report paint timing for same-document navigations, so FCP and LCP come from a heuristic. A `MutationObserver` watches newly added text, images, SVG, video and canvas, and measures when they paint and how much of the viewport they cover. CLS, INP and TBT are windowed to that navigation.
- **First visual change / visually complete** come from a CDP screencast. Chromium emits a frame only when pixels change. Frames that repeat the previous image byte for byte (for example ones forced by our own screenshots) are dropped. Visually complete stops at the next interactive step, so hover effects from the next click don't count.

Things to know:

- Chrome only counts **trusted** input as interactions. `click` and `type` steps dispatch real input through CDP, so they produce INP and stop LCP like a user would. An `el.click()` inside a `script` step still triggers navigations, and soft navigations are still attributed to it, but it produces no INP.
- The soft-navigation FCP/LCP are lab heuristics. They are not the same thing as Chrome's experimental soft-navigation API.
- Blocking time is the sum of long-task time above 50 ms inside each navigation's window. That's close to Lighthouse's TBT, but not identical.

## Security notes

- Every page and API route needs a signed-in user from an allowed domain, or the API key. In production, missing auth configuration fails closed.
- Treat `NAVPROBE_API_KEY` like a password: it grants full API access, including deleting any run.
- Navigation targets (`url` and `navigate` steps) must resolve to public IPs unless `ALLOW_PRIVATE_NETWORKS=true`. This check only covers what you ask the browser to open. A page (or your script) can still request other hosts, and redirects are followed.
- Scripts run inside the target page, never on the server.

## Development

```bash
npm run dev            # Next.js dev server
npm run typecheck      # route types + tsc
npm run format         # Prettier (organize-imports + tailwind class sorting)
npm run db:generate    # new migration after editing src/db/schema.ts or src/db/auth-schema.ts
npm run db:migrate     # apply migrations
npm run db:studio      # browse the database
```

Project layout:

```
src/app/api/…              HTTP API (runs, assets, health)
src/lib/scenario/          runner, browser launch, in-page agent, URL guard, zod schema
src/db/                    Drizzle schema + Neon client
src/lib/store.ts           persistence (runs, navigations, assets)
src/components/            shadcn UI: scenario builder, run report, history
drizzle/                   SQL migrations
```
