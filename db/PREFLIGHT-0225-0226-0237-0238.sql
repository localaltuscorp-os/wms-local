-- ============================================================================
--  PART 0 — PREFLIGHT for 0225, 0226, 0237 and 0238.
--
--  Run this BY ITSELF first. It changes NOTHING. It answers one question:
--  "will PART 1 succeed on the data that is actually in this database?"
--
--  Two of the four migrations put a CHECK constraint on a column that already
--  holds words typed by people over the past year. If a single row holds a word
--  the migration does not know how to translate, adding the constraint fails —
--  and it fails in the middle of a transaction with a message that names the
--  constraint, not the row. This finds that row first, by name.
--
--  Read the RESULT column. Every line must say OK. If any line says STOP, send
--  it to Claude before running PART 1 — do not edit the migration yourself.
-- ============================================================================

-- ── 1. Do the tables these migrations alter actually exist here? ────────────
-- A missing table means this database is further behind than we thought, and
-- PART 1 would fail on its first statement.
select
  t.name                                            as "table",
  case when to_regclass('public.' || t.name) is null
       then 'STOP — table missing'
       else 'OK' end                                as "result"
from (values
  ('candidate_policy_signatures'),  -- 0225 adds a column to it
  ('employees'),                    -- 0226 references it
  ('ops_checklist_items'),          -- 0237
  ('ops_checklist_checks'),         -- 0237
  ('jd_entries'),                   -- 0237
  ('dcc_kpi_items'),                -- 0238
  ('dcc_entries')                   -- 0238
) as t(name)
order by 2 desc, 1;

-- ── 2. Checklist tick statuses — the one that can actually fail ─────────────
-- 0237 translates the checklist's four words into the WMS six, then constrains
-- the column to those six. Anything it cannot translate is left behind and
-- breaks the constraint. This lists exactly what is in there.
select
  coalesce(status, '(null)')                        as "status found",
  count(*)                                          as "rows",
  case
    when status in ('Pending', 'Done', 'Need Help', 'Not Applicable')
      then 'OK — 0237 translates this'
    when status in ('dont_know','not_started','initiated','follow_up','need_info','done')
      then 'OK — already a WMS status'
    else 'STOP — 0237 has no rule for this word'
  end                                               as "result"
from ops_checklist_checks
group by status
order by 3 desc, 2 desc;

-- ── 3. DCC fill statuses ───────────────────────────────────────────────────
-- Cannot fail: 0238 leaves doer_status NULL for anything it does not recognise,
-- and NULL is allowed. But a word it does not know means those fills arrive in
-- WCC/MCC with a blank Doer Status, which is worth knowing BEFORE, not after.
select
  coalesce(status, '(null)')                        as "status found",
  count(*)                                          as "rows",
  case
    when status in ('Done', 'Pending', 'Not done', 'NA') then 'OK — 0238 carries this across'
    when status is null then 'OK — nothing to carry'
    else 'WARNING — arrives in WCC/MCC with a blank Doer Status'
  end                                               as "result"
from dcc_entries
group by status
order by 3 desc, 2 desc;

-- ── 4. Has any of this already been applied? ───────────────────────────────
-- All four are idempotent, so a second run is harmless — but if these say
-- "already there", PART 1 will be a no-op and that is expected, not a problem.
select
  c.what                                            as "change",
  case when c.present then 'already there' else 'will be added' end as "result"
from (values
  ('0225  candidate_policy_signatures.signature_path',
   (select count(*) > 0 from information_schema.columns
     where table_name = 'candidate_policy_signatures' and column_name = 'signature_path')),
  ('0226  employee_policy_signatures (table)',
   (to_regclass('public.employee_policy_signatures') is not null)),
  ('0237  ops_checklist_items.client',
   (select count(*) > 0 from information_schema.columns
     where table_name = 'ops_checklist_items' and column_name = 'client')),
  ('0237  jd_doer_notes (table)',
   (to_regclass('public.jd_doer_notes') is not null)),
  ('0238  dcc_entries.doer_status',
   (select count(*) > 0 from information_schema.columns
     where table_name = 'dcc_entries' and column_name = 'doer_status')),
  ('0238  dcc_kpi_items.month_day',
   (select count(*) > 0 from information_schema.columns
     where table_name = 'dcc_kpi_items' and column_name = 'month_day'))
) as c(what, present)
order by 1;
