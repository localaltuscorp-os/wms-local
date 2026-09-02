-- Replace task_priority enum with the Eisenhower 4-quadrant set.
ALTER TABLE "tasks" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TYPE "public"."task_priority" RENAME TO "task_priority_old";
CREATE TYPE "public"."task_priority" AS ENUM (
  'imp_urgent', 'imp_not_urgent', 'not_imp_urgent', 'not_imp_not_urgent'
);
ALTER TABLE "tasks"
  ALTER COLUMN "priority" TYPE "public"."task_priority"
  USING (
    CASE "priority"::text
      WHEN 'high' THEN 'imp_urgent'::task_priority
      WHEN 'med'  THEN 'not_imp_urgent'::task_priority
      WHEN 'low'  THEN 'not_imp_not_urgent'::task_priority
    END
  );
ALTER TABLE "tasks"
  ALTER COLUMN "priority" SET DEFAULT 'not_imp_not_urgent'::task_priority;
DROP TYPE "public"."task_priority_old";
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "subject" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX "tasks_archived_idx" ON "tasks" USING btree ("archived","created_at");
