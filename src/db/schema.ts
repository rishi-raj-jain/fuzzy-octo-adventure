import type { ConsoleEntry, RequestEntry, RunOptions, RunRequest, StepResult } from '@/lib/scenario/schema'
import { index, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'

export const runs = pgTable(
  'runs',
  {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    url: text('url').notNull(),
    finalUrl: text('final_url'),
    title: text('title'),
    status: text('status', { enum: ['running', 'ok', 'error', 'timeout', 'aborted'] }).notNull(),
    /** Email of the signed-in user, or "api-key" for programmatic runs. */
    createdBy: text('created_by'),
    /** Vercel region the browser ran in (e.g. "fra1"), or "local". */
    region: text('region'),
    error: text('error'),
    durationMs: integer('duration_ms'),
    browserVersion: text('browser_version'),
    device: text('device').notNull(),
    network: text('network').notNull(),
    totalRequests: integer('total_requests'),
    totalBytes: integer('total_bytes'),
    input: jsonb('input').$type<RunRequest>().notNull(),
    options: jsonb('options').$type<RunOptions>().notNull(),
    steps: jsonb('steps').$type<StepResult[]>(),
    requests: jsonb('requests').$type<RequestEntry[]>(),
    console: jsonb('console').$type<ConsoleEntry[]>(),
  },
  (t) => [index('runs_created_at_idx').on(t.createdAt), index('runs_url_idx').on(t.url), index('runs_created_by_idx').on(t.createdBy)],
)

/** One row per hard (document) or soft (same-document) navigation, so vitals can be queried over time. */
export const navigations = pgTable(
  'navigations',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: text('kind', { enum: ['hard', 'soft'] }).notNull(),
    url: text('url').notNull(),
    stepIndex: integer('step_index').notNull(),
    startedAtMs: integer('started_at_ms').notNull(),
    trigger: text('trigger'),
    navType: text('nav_type'),
    httpStatus: integer('http_status'),
    urlChangeAt: real('url_change_at'),
    ttfb: real('ttfb'),
    fcp: real('fcp'),
    lcp: real('lcp'),
    cls: real('cls'),
    inp: real('inp'),
    tbt: real('tbt'),
    longTasks: integer('long_tasks'),
    dcl: real('dcl'),
    load: real('load'),
    firstVisualChange: real('first_visual_change'),
    visuallyComplete: real('visually_complete'),
    lcpElement: text('lcp_element'),
    inpTarget: text('inp_target'),
    requests: integer('requests').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('navigations_run_idx').on(t.runId), index('navigations_url_idx').on(t.url, t.createdAt)],
)

/** Screenshots and filmstrip frames (base64 JPEG), served by /api/assets/[id]. */
export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['screenshot', 'frame'] }).notNull(),
    mime: text('mime').notNull().default('image/jpeg'),
    data: text('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assets_run_idx').on(t.runId)],
)

export type RunRow = typeof runs.$inferSelect
export type NavigationRow = typeof navigations.$inferSelect
