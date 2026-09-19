-- ============================================================================
--  PART 0 — PREFLIGHT for 0225, 0226, 0237 and 0238. Read-only.
--
--  Run this BY ITSELF first. It changes NOTHING. It answers one question:
--  "will PART 1 succeed on the data that is actually in this database?"
--
--  Two of the four migrations put a CHECK constraint on a column that already
--  holds words typed by people over the past year. If a row holds a word the
--  migration cannot translate, adding the constraint fails. This finds that row
--  first, by name.
--
--  ONE result table on purpose: the Supabase SQL editor shows only the LAST
--  statement's result, so four separate queries would hide three of them.
--
--  Read the RESULT column. Nothing may say STOP. If anything does, send the
--  whole table to Claude before running PART 1 — do not edit the migration.
-- ============================================================================

select section, item, detail, result from (

  -- ── 1. The tables these migrations alter must exist ──────────────────────
  select 1 as ord, '1. table exists' as section, t.name as item, '' as detail,
         case when to_regclass('public.' || t.name) is null
              then 'STOP — table missing' else 'OK' end as result
    from (values ('candidate_policy_signatures'), ('employees'),
                 ('ops_checklist_items'), ('ops_checklist_checks'),
                 ('jd_entries'), ('dcc_kpi_items'), ('dcc_entries')) as t(name)

  union all

  -- ── 2. Checklist tick statuses — the only one that can actually fail ────
  select 2, '2. checklist status', coalesce(status, '(null)'), count(*)::text || ' rows',
         case
           when status in ('Pending', 'Done', 'Need Help', 'Not Applicable')
             then 'OK — 0237 translates this'
           when status in ('dont_know','not_started','initiated','follow_up','need_info','done')
             then 'OK — already a WMS status'
           else 'STOP — 0237 has no rule for this word'
         end
    from ops_checklist_checks
   group by status

  union all

  -- ── 3. DCC fill statuses — cannot fail, but an unknown word arrives blank ─
  select 3, '3. DCC fill status', coalesce(status, '(null)'), count(*)::text || ' rows',
         case
           when status in ('Done', 'Pending', 'Not done', 'NA') then 'OK — 0238 carries this across'
           when status is null then 'OK — nothing to carry'
           else 'WARNING — arrives in WCC/MCC with a blank Doer Status'
         end
    from dcc_entries
   group by status

  union all

  -- ── 4. Already applied? All four are idempotent, so either answer is fine ─
  select 4, '4. already applied?', c.what, '',
         case when c.present then 'already there — PART 1 will skip it'
              else 'will be added' end
    from (values
      ('0225  candidate_policy_signatures.signature_path',
       exists (select 1 from information_schema.columns
                where table_name = 'candidate_policy_signatures' and column_name = 'signature_path')),
      ('0226  employee_policy_signatures',
       to_regclass('public.employee_policy_signatures') is not null),
      ('0237  ops_checklist_items.client',
       exists (select 1 from information_schema.columns
                where table_name = 'ops_checklist_items' and column_name = 'client')),
      ('0237  jd_doer_notes',
       to_regclass('public.jd_doer_notes') is not null),
      ('0238  dcc_entries.doer_status',
       exists (select 1 from information_schema.columns
                where table_name = 'dcc_entries' and column_name = 'doer_status')),
      ('0238  dcc_kpi_items.month_day',
       exists (select 1 from information_schema.columns
                where table_name = 'dcc_kpi_items' and column_name = 'month_day'))
    ) as c(what, present)

) as preflight
order by ord, result desc, item;
