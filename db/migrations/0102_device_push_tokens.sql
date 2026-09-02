-- 0102 — device push tokens for native-mobile (FCM) push notifications.
-- One row per device token; a token is globally unique and belongs to whichever
-- employee last registered it (re-login on a shared phone reassigns it). Dead
-- tokens are pruned by the FCM sender when Firebase reports them unregistered.

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token       text NOT NULL,
  platform    text NOT NULL DEFAULT 'android',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_token_uq ON device_push_tokens (token);
CREATE INDEX IF NOT EXISTS device_push_tokens_employee_idx ON device_push_tokens (employee_id);
