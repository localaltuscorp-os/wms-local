CREATE TYPE "public"."approval_status" AS ENUM('approved', 'not_approved', 'cancelled', 'transferred');--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'need_info' BEFORE 'done';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'follow_up_1' BEFORE 'done';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'follow_up_2' BEFORE 'done';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'follow_up_3' BEFORE 'done';--> statement-breakpoint
DROP INDEX "tasks_pending_created_idx";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "approval_status" "approval_status";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "revised_target_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence" text;--> statement-breakpoint
CREATE INDEX "tasks_approval_status_idx" ON "tasks" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "tasks_pending_created_idx" ON "tasks" USING btree ("created_at") WHERE "tasks"."status" IN ('not_started','initiated','follow_up','need_help','need_info','follow_up_1','follow_up_2','follow_up_3');