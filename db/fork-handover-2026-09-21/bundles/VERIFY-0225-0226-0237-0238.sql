-- ============================================================================
--  PART 2 — VERIFY 0225, 0226, 0237 and 0238. Read-only; changes nothing.
--
--  Run after PART 1. Every row must say PASS. If any says FAIL, send the whole
--  result to Claude before pushing the code that depends on it.
-- ============================================================================

select check_name, case when ok then 'PASS' else 'FAIL' end as result
from (values

  -- ── 0225 (Rudra) ─────────────────────────────────────────────────────────
  ('0225  candidate_policy_signatures.signature_path exists',
   exists (select 1 from information_schema.columns
            where table_name = 'candidate_policy_signatures' and column_name = 'signature_path')),

  -- ── 0226 (Rudra) ─────────────────────────────────────────────────────────
  ('0226  employee_policy_signatures table exists',
   to_regclass('public.employee_policy_signatures') is not null),
  ('0226  one signature per employee per policy (unique)',
   exists (select 1 from pg_constraint where conname = 'employee_policy_signature_uq')),

  -- ── 0237 (Vinal) ─────────────────────────────────────────────────────────
  ('0237  checklist rows have Client, Initiator, repeat rule',
   (select count(*) from information_schema.columns
     where table_name = 'ops_checklist_items'
       and column_name in ('client', 'initiator_id', 'recurrence_rule')) = 3),
  ('0237  checklist ticks have the Approver columns',
   (select count(*) from information_schema.columns
     where table_name = 'ops_checklist_checks'
       and column_name in ('approver_status', 'approver_notes', 'approver_id', 'approver_at')) = 4),
  ('0237  no checklist tick still holds an old status word',
   not exists (select 1 from ops_checklist_checks
                where status in ('Pending', 'Done', 'Need Help', 'Not Applicable'))),
  ('0237  every checklist tick holds a WMS status',
   not exists (select 1 from ops_checklist_checks
                where status not in ('dont_know','not_started','initiated','follow_up','need_info','done'))),
  ('0237  new checklist ticks default to not_started',
   (select column_default from information_schema.columns
     where table_name = 'ops_checklist_checks' and column_name = 'status') like '%not_started%'),
  ('0237  jd_entries.client exists',
   exists (select 1 from information_schema.columns
            where table_name = 'jd_entries' and column_name = 'client')),
  ('0237  jd_doer_notes table exists',
   to_regclass('public.jd_doer_notes') is not null),

  -- ── 0238 (Vinal) ─────────────────────────────────────────────────────────
  ('0238  dcc_kpi_items.month_day exists',
   exists (select 1 from information_schema.columns
            where table_name = 'dcc_kpi_items' and column_name = 'month_day')),
  ('0238  DCC fills have the WMS columns',
   (select count(*) from information_schema.columns
     where table_name = 'dcc_entries'
       and column_name in ('doer_status', 'done_at', 'approver_status',
                           'approver_notes', 'approver_id', 'approver_at')) = 6),
  ('0238  every old fill was carried across (none left without a Doer Status)',
   not exists (select 1 from dcc_entries
                where doer_status is null and status in ('Done', 'Pending', 'Not done', 'NA'))),
  ('0238  every Done fill has its actual date',
   not exists (select 1 from dcc_entries where status = 'Done' and done_at is null)),
  ('0238  the old status column is still there (Android app + 10 pm report)',
   exists (select 1 from information_schema.columns
            where table_name = 'dcc_entries' and column_name = 'status'))

) as v(check_name, ok)
order by check_name;
