-- Admin review records for submitted onboarding forms. This is separate from
-- onboarding_submissions so review never changes the form or provisioning gate.

CREATE TABLE IF NOT EXISTS "onboarding_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "submission_id" uuid NOT NULL REFERENCES "onboarding_submissions"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected')),
  "decision_note" text,
  "decided_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "decided_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onboarding_approval_submission_uq" UNIQUE ("submission_id")
);

CREATE INDEX IF NOT EXISTS "onboarding_approval_status_idx"
  ON "onboarding_approvals" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "onboarding_approval_employee_idx"
  ON "onboarding_approvals" ("employee_id");
