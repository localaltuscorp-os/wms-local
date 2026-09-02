-- 0089 — Accounts · Task List dropdown options.
-- Ensure the Status (Done / Need Help / Pending) and Gear (Coach / Delegate /
-- Demo / Support) options exist for the inline table dropdowns. Idempotent.

INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('task_status','Done',1),('task_status','Need Help',2),('task_status','Pending',3),
  ('task_gear','Coach',1),('task_gear','Delegate',2),('task_gear','Demo',3),('task_gear','Support',4)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
