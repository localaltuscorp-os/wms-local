-- M2.3-lite — per-user inbox visit marker. Drives the unread-badge math
-- in the main nav. Initialized to now() on column add so existing rows
-- start with a zero unread count (no avalanche of "new" events).

ALTER TABLE "employees"
  ADD COLUMN "last_inbox_visit_at" timestamp with time zone
  NOT NULL DEFAULT now();
