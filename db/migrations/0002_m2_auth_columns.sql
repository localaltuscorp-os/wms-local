ALTER TABLE "employees" ADD COLUMN "firebase_uid" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "joined_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "employees_firebase_uid_idx" ON "employees" USING btree ("firebase_uid");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_firebase_uid_unique" UNIQUE("firebase_uid");