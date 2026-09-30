# NavProbe

Scripted navigation testing with Web Vitals for every page load, in the spirit of WebPageTest scripting.

You give it a URL and a list of steps: wait _n_ seconds, run JavaScript in the page, click, type, wait for a selector, navigate. It runs them in a real headless Chromium (Puppeteer) and reports:

- **Vitals for every navigation.** This covers the initial load, full page loads triggered by a click, script or form (**hard** navigations), and client-side route changes (**soft** navigations, via `history.pushState` or the Navigation API). Each navigation gets TTFB, FCP, LCP, CLS, INP, blocking time (TBT), DCL and load, plus first visual change and visually complete taken from the screen recording.
- **Screenshots** after every step, and a **filmstrip** with a frame for every visual change.
- A **request waterfall** grouped by step, the **console log** (including page errors and dialogs), each script's **return value**, and the URL changes seen in each step.
- **Emulation** of device (desktop, iPhone, Android), network (Fast 4G through Slow 3G), CPU throttling, user agent and extra headers.
- **History** in Neon Postgres (Drizzle ORM). Every run gets a permalink, and navigations are stored as rows so you can query vitals over time.
- **Run comparison** (`/compare?runs=a,b`), in the spirit of WebPageTest's filmstrip view. Up to 4 runs play on one time axis, aligned on any navigation (initial load or a later click). Highlighted frames show visual changes, FCP/LCP/visually-complete are marked in place, and timings and every metric are shown with deltas against run A. Tick runs in _Recent runs_ or use **Compare** on a run page.
- **Run from different Vercel regions.** Pick a region per run (`options.region`) to measure TTFB and load times from Frankfurt, Singapore, etc. Every run records the region it actually executed in, shown in the report, history and comparisons.
- **Filmstrips in Neon Object Storage** (S3-compatible, via `aws4fetch`), served to the browser through short-lived presigned URLs.
- **Sign in with Google** through [Neon Auth](https://neon.com/docs/auth/overview), limited to allowed email domains (`@launchfa.st`, `@neon.com`, `@neon.tech` and `@databricks.com` by default). Programmatic clients use an API key instead.
- **Responsive UI** from 320 px phones to wide desktops, with larger touch targets on touch devices.

The UI (Next.js App Router + shadcn/ui) is a thin client over the HTTP API, so anything you can do in the browser you can also do with `curl`.

## Quick start

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL and the two NEON_AUTH_* variables
npm run db:migrate                # creates the tables in your Neon database
npm run dev
```

Without the `NEON_AUTH_*` variables, `next dev` runs with sign-in **turned off** (the header shows an "Auth off (dev)" badge). Production refuses all access until they're set. Neon Auth already trusts any `localhost` port, so Google sign-in works locally with no extra setup.

Locally, the app uses `CHROME_EXECUTABLE_PATH` or the first Chrome/Chromium it finds (macOS Chrome, `/usr/bin/google-chrome`, Playwright's browsers, …). On Vercel it uses [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium).

## Deploying to Vercel

1. Import the repo in Vercel.
2. Add a Neon database (Storage → Neon, or the Neon integration). It sets `DATABASE_URL` for you.
3. Run the migrations once against that database: `DATABASE_URL=... npm run db:migrate`.
4. Set up sign-in (below).
5. Optional: set `NAVPROBE_API_KEY` to allow API access without a browser session (scripts, CI).

### Sign-in with Neon Auth (Google only)

Neon Auth is managed Better Auth running next to your Neon database. It stores users and sessions in the `neon_auth` schema. The app talks to it through [`@neondatabase/auth`](https://neon.com/docs/auth/quick-start/nextjs-api-only).

1. **Enable Auth.** In the Neon Console, open your project and go to **Auth**. Copy the **Auth URL** into `NEON_AUTH_BASE_URL`.
2. **Cookie secret.** Set `NEON_AUTH_COOKIE_SECRET` to a random value of at least 32 characters, for example `openssl rand -base64 32`.
3. **Google only.** Keep Google as the only sign-in method in **Auth → Configuration**, with email/password disabled. The app also refuses every other method on its own `/api/auth/*` proxy.
4. **Google credentials for production.** Neon's shared Google credentials are for development only. Create an OAuth client in Google Cloud and register the redirect URI `<NEON_AUTH_BASE_URL>/callback/google`. Then add it under **Settings → Auth → OAuth providers**, or with `neon neon-auth oauth-provider add --provider-id google --oauth-client-id … --oauth-client-secret …`.
5. **Trusted domains.** Add your production origin under **Auth → Configuration → Domains**, for example `https://navprobe.vercel.app`. For preview deployments, use a pattern such as `https://*-your-team.vercel.app`. Neon Auth won't redirect back to an origin that isn't listed.
6. **Block other domains at sign-up.** Under **Auth → Configuration → Webhooks**, set the URL to `https://<your-domain>/api/webhooks/neon-auth` and enable `user.before_create`. The endpoint verifies Neon's Ed25519 signature against your Auth URL's JWKS. It then denies any email that isn't on an allowed domain, and any non-Google sign-up. Neon Auth fails closed, so if the webhook is unreachable, sign-ups are refused.
7. Optional: change who can sign in with `ALLOWED_EMAIL_DOMAINS` (comma separated). The default is `launchfa.st,neon.com,neon.tech,databricks.com`.

How access is enforced:

- **At sign-up** (step 6): the webhook stops accounts from other domains, and password accounts, from being created.
- **On every request:** the app requires a verified email whose domain exactly matches an allowed domain. `a@neon.com` is allowed. `a@sub.neon.com` and `a@neon.com.evil.dev` are not. This check covers accounts created before the webhook existed, and domains you remove later.
- **Rejected accounts** are signed out and shown an explanation on `/login`.
- **Pages:** `src/proxy.ts` runs Neon Auth's middleware. It completes the Google round-trip, refreshes sessions and sends signed-out visitors to `/login`. The `(app)` layout rejects accounts that aren't allowed.
- **API routes:** these need either an allowed session or `NAVPROBE_API_KEY`. That includes screenshots under `/api/assets/*`.
- **Team history:** runs are shared across the team. Each run records who started it, and only that person (or an API key) can delete it.

`/api/runs` exports `maxDuration = 300`, and the runner stops scheduling steps after `MAX_RUN_SECONDS` (default 270) so there's time to save the results. If your plan allows longer functions, raise both. Chromium wants about 1.5 GB of memory; Vercel's default function memory is enough.

`next.config.ts` adds the packed Chromium to the `/api/runs` function only, via `outputFileTracingIncludes`.

### Neon Object Storage (filmstrips)

Filmstrip frames are uploaded to a private bucket at `runs/<runId>/frames/NNNN.jpg`. The database stores `s3:<key>` references, never URLs, because presigned URLs expire. Every API response that returns a run (the streamed `step` events, the JSON result and `GET /api/runs/:id`) swaps those references for presigned GET URLs valid for one hour. The browser then loads the images straight from Neon Object Storage.

1. Create a bucket on your branch (the default name is `assets`): Console → **Object storage → New bucket**, or run `neon buckets create assets`. Keep it **private**.
2. Create an access key **for the same branch** with `neon credentials create --scope storage:read --scope storage:write`. Keys are branch-scoped: a key minted for another branch fails with `InvalidAccessKeyId`.
3. Set `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, plus `S3_BUCKET` if your bucket isn't called `assets`.

- Deleting a run also deletes its frames.
- If an upload fails, that frame is stored in Postgres instead, so it still appears in the filmstrip.
- Without these variables, frames go to Postgres as before. Screenshots always stay in Postgres.

### Regions

Vercel runs a function in the regions it is deployed to, and a request can't choose among them. So every region has its own run endpoint, `/api/regions/<code>/runs` (19 small route files generated by `npm run regions:generate`, all sharing `src/lib/run-handler.ts`). `vercel.ts` pins the endpoints listed in `NAVPROBE_REGIONS` to their region when you deploy.

1. Set `NAVPROBE_REGIONS` in the Vercel project, e.g. `fra1,sin1,sfo1` (codes from the [region list](https://vercel.com/docs/regions#region-list)).
2. Redeploy. The variable is read at build time, and only the listed endpoints get the Chromium binary.
3. Pick the region under **Emulation → Run from**, or send `"options": { "region": "fra1" }` to `POST /api/runs`. That answers `307` to `/api/regions/fra1/runs`, so use `curl -L` or call the regional endpoint directly.

- **Plan limits.** Plans cap the number of function regions per deployment: Hobby 1, Pro 5, Enterprise all. The project's default region counts toward the cap. Going over fails the deployment, so leave `NAVPROBE_REGIONS` unset on Hobby.
- **Endpoints not in the list** stay in the default region. They answer `409` instead of running, so a run is never labelled with a region it didn't use.
- **The recorded region** is `VERCEL_REGION` at run time, or `local` outside Vercel. The database is in one region, so saving results from a far-away region takes a little longer. The measured page timings are unaffected.

(Next.js 16 deprecates the `preferredRegion` route segment config, so the regions are configured through Vercel instead.)

### Environment variables

| Variable                                      | Purpose                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Neon connection string. Without it runs still work, but nothing is saved and images are inlined as data URLs.                     |
| `NEON_AUTH_BASE_URL`                          | Neon Auth URL from the Console, e.g. `https://ep-….neonauth….aws.neon.tech/neondb/auth` (required in production).                 |
| `NEON_AUTH_COOKIE_SECRET`                     | At least 32 random characters. Signs the session cache cookie (required in production).                                           |
| `ALLOWED_EMAIL_DOMAINS`                       | Comma-separated email domains allowed to sign in (default `launchfa.st,neon.com,neon.tech,databricks.com`).                       |
| `AWS_ENDPOINT_URL_S3`                         | Neon Object Storage endpoint for your branch, e.g. `https://br-….storage.c-7.us-east-2.aws.neon.tech`. Enables filmstrip storage. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Branch-scoped storage credentials (`nak_live_…` / `nsk_live_…`).                                                                  |
| `AWS_REGION`                                  | Region for SigV4 signing (e.g. `us-east-2`).                                                                                      |
| `S3_BUCKET`                                   | Bucket for filmstrip frames (default `assets`).                                                                                   |
| `NAVPROBE_REGIONS`                            | Comma-separated Vercel regions to run from (e.g. `fra1,sin1`). Read at deploy time by `vercel.ts`; see [Regions](#regions).       |
| `NAVPROBE_API_KEY`                            | Lets programmatic clients call the API with `Authorization: Bearer <key>` or `x-api-key: <key>`.                                  |
| `MAX_RUN_SECONDS`                             | Hard cap per run (default 270). Keep it below the route's `maxDuration`.                                                          |
| `ALLOW_PRIVATE_NETWORKS`                      | `true` allows localhost and private IPs as targets (always allowed in `next dev`).                                                |
| `CHROME_EXECUTABLE_PATH`                      | Local Chrome/Chromium binary to use instead of auto-detection.                                                                    |
| `CHROME_PROXY_SERVER`                         | Send the local browser through an HTTP proxy.                                                                                     |

## API

### `POST /api/runs`: run a scenario

```bash
curl -X POST https://your-app.vercel.app/api/runs \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $NAVPROBE_API_KEY" \
  -d '{
    "url": "https://nextjs.org",
    "steps": [
      { "type": "click", "selector": "a[href=\"/docs\"]" },
      { "type": "waitForNavigation" }
    ],
    "options": { "device": "iphone", "network": "Fast 4G", "cpuThrottle": 4, "waitUntil": "networkidle0" }
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
| `waitForNavigation`  | `idleMs` (default 500), `timeoutSeconds`: see below                                              |
| `navigate`           | `url`                                                                                            |

**`waitForNavigation`** waits for the navigation that the previous action step caused. It works the same for a full page load and a client-side route change, even if the navigation began while the click was still running. It then waits until no request has been in flight for `idleMs` (plus the `load` event, for page loads), and until the screen has stopped changing (at most 5 s more). If a redirect or another navigation follows, it waits for that one instead. The step fails only when no navigation happens within `timeoutSeconds`. A page that never goes quiet (polling, animations) just gets a note, and the run continues. So "load the page, click, wait for the navigation" works for any site:

```json
{
  "url": "https://old.example.com/search?q=bus",
  "steps": [{ "type": "click", "selector": "a[href=\"/wiki/Bus\"]" }, { "type": "waitForNavigation" }],
  "options": { "waitUntil": "networkidle0" }
}
```

Run the same scenario against the old and the new site, then compare them. Navigation #1 is the first page load and #2 is the click, whether it was hard or soft.

Selectors are Puppeteer selectors. Plain CSS works, and so do `::-p-text(Sign in)`, `::-p-aria(Submit)` and `::-p-xpath(...)`. `click`, `type` and `waitForSelector` use the first _visible_ match, so hidden copies (a collapsed mobile menu, for instance) are skipped. Any step can also carry a `label`.

**Options** (all optional): `device` (`desktop`, `desktop-hd`, `iphone`, `android`), `network` (`none`, `Fast 4G`, `Slow 4G`, `Fast 3G`, `Slow 3G`), `cpuThrottle` (1–20), `waitUntil` for the initial load (`load`, `domcontentloaded`, `networkidle2`, `networkidle0`), `screenshots`, `filmstrip`, `continueOnError`, `userAgent`, `headers`, `region` (a Vercel region code enabled with `NAVPROBE_REGIONS`; see [Regions](#regions)).

**Responses.**

- By default the endpoint waits for the run to finish and returns the whole run as JSON. The status is 200 when the run succeeded, 502 when a step failed and 504 on timeout.
- With `?stream=1` or `Accept: application/x-ndjson` it streams NDJSON events: `start`, `step-start`, `step`, `navigations`, `heartbeat`, then a final `done` (or `error`). The UI uses this mode.

When a database is configured, screenshots and frames come back as `/api/assets/<id>` URLs, so responses stay small.

### Other endpoints

| Method & path                  | Description                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `POST /api/regions/:code/runs` | Same as `POST /api/runs`, executed in that Vercel region (`409` if the region isn't enabled).         |
| `GET /api/runs`                | Recent runs (`?limit=20&before=<ISO date>&url=<exact url>&mine=1`), with the initial load's vitals.   |
| `GET /api/runs/:id`            | The full stored run: steps, navigations, requests, console, the original input and who started it.    |
| `DELETE /api/runs/:id`         | Deletes a run and its images (creator or API key only).                                               |
| `GET /api/assets/:id`          | A stored screenshot or frame (same auth as the rest of the API).                                      |
| `GET /api/health`              | Public. Auth mode and allowed domains, persistence, enabled regions, limits and accepted enum values. |
| `/api/auth/*`                  | Proxy to Neon Auth, limited to Google sign-in, session, sign-out and token.                           |
| `POST /api/webhooks/neon-auth` | Neon Auth `user.before_create` webhook (signature-verified). Allows or denies sign-ups.               |

## How navigations are measured

Before any page script runs, a small agent (`src/lib/scenario/page-agent.ts`) is injected into **every document**. It keeps one record per navigation and streams it to Node through a CDP binding. It also flushes on `pagehide`, so a page that navigates away still reports its numbers.

- **Hard navigations** use the browser's own entries: Navigation Timing (TTFB, DCL, load), `paint` (FCP), `largest-contentful-paint`, `layout-shift` (CLS, largest session window), `event` (INP) and `longtask` (TBT).
- **Soft navigations** start when a same-document navigation changes the path or query (Navigation API `currententrychange`, with a `pushState`/`popstate` fallback). The start is anchored to the interaction that caused it: a pointerdown, click, keydown or submit within 1 s before the URL change. Browsers don't report paint timing for same-document navigations, so FCP and LCP come from a heuristic. A `MutationObserver` watches newly added text, images, SVG, video and canvas, and measures when they paint and how much of the viewport they cover. CLS, INP and TBT are windowed to that navigation. Some URL changes aren't navigations, and are ignored:
  - a `replaceState` without user input, such as tracking parameters or canonical URLs;
  - a URL change right before a full page load that paints nothing in the meantime. Wikipedia, for example, adds a search token to the URL when you click a result.
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
npm run db:generate    # new migration after editing src/db/schema.ts
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
