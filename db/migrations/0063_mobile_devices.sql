-- 0063 — mobile attendance device-binding (native app anti-proxy).
-- Idempotent: safe to re-run. See migration-journal-out-of-sync memory.

CREATE TABLE IF NOT EXISTS "mobile_devices" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "device_id"   text NOT NULL,
  "label"       text,
  "platform"    text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "mobile_devices_device_id_uq" ON "mobile_devices" ("device_id");
CREATE INDEX IF NOT EXISTS "mobile_devices_employee_idx" ON "mobile_devices" ("employee_id");

-- Stamp which registered phone a native self-punch came from.
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "mobile_device_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_logs_mobile_device_id_fk'
  ) THEN
    ALTER TABLE "attendance_logs"
      ADD CONSTRAINT "attendance_logs_mobile_device_id_fk"
      FOREIGN KEY ("mobile_device_id") REFERENCES "mobile_devices"("id") ON DELETE SET NULL;
  END IF;
END $$;
