ALTER TABLE "analysis_runs" ADD COLUMN "provider" text DEFAULT 'groq' NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;