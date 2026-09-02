-- M5.1 — notification_matrix: per-event channel routing config.
--
-- Stored as JSONB on the existing single-row org_settings table so we keep one
-- source of truth for org-wide config. Key = NotificationKind (matches the
-- 10-value list in db/schema.ts NOTIFICATION_KINDS), value = array of channel
-- names ("email" | "slack" | "whatsapp" | "push"). Missing keys fall back to
-- all channels at the resolver level so unmapped events keep M4 behaviour.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

alter table org_settings
  add column if not exists notification_matrix jsonb not null
    default '{
      "task_assigned":   ["email","slack","whatsapp","push"],
      "task_initiated":  ["email","slack","whatsapp","push"],
      "status_changed":  ["email","slack","whatsapp","push"],
      "approved":        ["email","slack","whatsapp","push"],
      "declined":        ["email","slack","whatsapp","push"],
      "reassigned":      ["email","slack","whatsapp","push"],
      "transferred":     ["email","slack","whatsapp","push"],
      "cancelled":       ["email","slack","whatsapp","push"],
      "commented":       ["email","slack","whatsapp","push"],
      "overdue_digest":  ["email"]
    }'::jsonb;
