-- 0173 — Goal Capture (natural-language → structured goals).
-- Idempotent (house convention: apply via one-off tsx, NOT db:migrate).

-- Batch id stamped on every goal created by an AI capture, so the board's
-- "Undo all" banner can soft-delete exactly that batch. `goals.source` already
-- exists (defaults 'manual'); captured goals are inserted with source='ai'.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS capture_batch_id uuid;
CREATE INDEX IF NOT EXISTS goals_capture_batch_id_idx ON goals (capture_batch_id);

-- Audit + AI-quality log: one row per capture (any channel).
CREATE TABLE IF NOT EXISTS goal_capture_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  batch_id     uuid,
  channel      text NOT NULL,                 -- 'in_app_text' | 'in_app_voice' | 'whatsapp_text' | 'whatsapp_voice'
  raw_text     text,                          -- the message / typed text
  transcript   text,                          -- STT output for voice channels
  model        text,                          -- the model that structured it
  row_count    integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goal_capture_log_employee_idx ON goal_capture_log (employee_id, created_at DESC);
