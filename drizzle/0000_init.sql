CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text DEFAULT 'image/jpeg' NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "navigations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"step_index" integer NOT NULL,
	"started_at_ms" integer NOT NULL,
	"trigger" text,
	"nav_type" text,
	"http_status" integer,
	"url_change_at" real,
	"ttfb" real,
	"fcp" real,
	"lcp" real,
	"cls" real,
	"inp" real,
	"tbt" real,
	"long_tasks" integer,
	"dcl" real,
	"load" real,
	"first_visual_change" real,
	"visually_complete" real,
	"lcp_element" text,
	"inp_target" text,
	"requests" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"url" text NOT NULL,
	"final_url" text,
	"title" text,
	"status" text NOT NULL,
	"error" text,
	"duration_ms" integer,
	"browser_version" text,
	"device" text NOT NULL,
	"network" text NOT NULL,
	"total_requests" integer,
	"total_bytes" integer,
	"input" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"steps" jsonb,
	"requests" jsonb,
	"console" jsonb
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigations" ADD CONSTRAINT "navigations_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_run_idx" ON "assets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "navigations_run_idx" ON "navigations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "navigations_url_idx" ON "navigations" USING btree ("url","created_at");--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "runs_url_idx" ON "runs" USING btree ("url");