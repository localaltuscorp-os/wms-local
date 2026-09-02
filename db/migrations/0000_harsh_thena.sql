CREATE TYPE "public"."employee_role" AS ENUM('doer', 'initiator', 'both');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'med', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('not_started', 'initiated', 'follow_up', 'need_help', 'done', 'approved', 'not_approved', 'cancelled', 'transferred');--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "employee_role" NOT NULL,
	"avatar_url" text,
	"department" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"doer_id" uuid NOT NULL,
	"initiator_id" uuid NOT NULL,
	"priority" "task_priority" DEFAULT 'med' NOT NULL,
	"status" "task_status" DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"transferred_from_id" uuid,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_doer_id_employees_id_fk" FOREIGN KEY ("doer_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_initiator_id_employees_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_transferred_from_id_employees_id_fk" FOREIGN KEY ("transferred_from_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_doer_created_idx" ON "tasks" USING btree ("doer_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_initiator_created_idx" ON "tasks" USING btree ("initiator_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_status_created_idx" ON "tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_pending_created_idx" ON "tasks" USING btree ("created_at") WHERE "tasks"."status" IN ('not_started','initiated','follow_up','need_help');