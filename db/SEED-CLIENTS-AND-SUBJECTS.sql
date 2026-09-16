-- ===========================================================================
--  SEED THE CLIENT AND SUBJECT PICKERS
--
--  Reported 2026-09-15: the New Task form offers far fewer clients and
--  subjects on production than on the team's own database.
--
--  THIS IS A DATA GAP, NOT A BUG. Both pickers read rows straight out of
--  `clients` and `subjects` filtered on `is_active = true`
--  (lib/queries/clients.ts, lib/queries/subjects.ts). There is no code path
--  that could hide these names:
--
--    * The only code-level filter is lib/tasks/subject-options.ts, and it
--      retires exactly two values -- "WMS" and "WMS App" -- neither of which
--      is on the reported list. "Altus Ecosystem" is PINNED there, so it is
--      always offered whether or not a row exists.
--    * Clients have no policy layer at all. Row present and active, or not
--      offered.
--
--  So the rows exist on their database and not on this one, which is exactly
--  what a team working on a separate Supabase project produces.
--
--  ── ORDER: RUN STEP 1, READ IT, THEN RUN STEP 2 ──────────────────────────
--  Step 1 changes nothing. It tells you whether each name is missing
--  altogether or merely switched off -- a different fix, and worth knowing
--  before you write.
--
--  Run them as SEPARATE queries. The Supabase editor shows only the LAST
--  result set of a multi-statement run, so pasting the whole file at once
--  would show you step 2's report and silently discard step 1's.
-- ===========================================================================


-- ═══ STEP 1 — DIAGNOSE (read-only) ═══════════════════════════════════════
-- One query, one table. `state` is the thing to read:
--   missing   -> no row at all; step 2 inserts it
--   inactive  -> row exists but is_active = false; step 2 switches it back on
--   active    -> already offered; step 2 leaves it alone

with wanted as (
  select 'client' as kind, name from unnest(array[
    'AICL','Altus Corp','Aria Aerial','Arihant Lubricants','Bellavita','BSS',
    'Carbide India','Crish Metalworks','Dharav Enterprises','Ehara Engineering',
    'JMT Drive Solutions','Manan Vasa','Mitul Mehta - Self','Niaa Jewels',
    'Nirman Corp','Prime Graphite','PSO','Raj - Test','Saaro','Sattva Logistics',
    'Stellary','Sukhson','VPinnacle'
  ]) as name
  union all
  select 'subject', name from unnest(array[
    'Accounts','Admin','Altus Ecosystem','Altus Tribe App','App','Approvals',
    'Back Office','Billing','BSS','BSS App','Collaboration','Collection',
    'Consulting','CRM','Dashboard','Data','DCC','Documentation','Follow Ups',
    'Handholding','HR','Incentive','Insta Videos','Internal Development',
    'Interviews','Jodo','KPI','Marketing','MIS','Operations','Others','Pay U',
    'Personal','Project','PS','PS App','PS Manual','PSO','PSO App','Recruitment',
    'Red Flag','Reimbursement','Sales','Social Media','SOP','System','Systems',
    'Tally','Test','Training','Website'
  ]) as name
)
select w.kind,
       w.name,
       case
         when w.kind = 'client' then
           coalesce((select case when c.is_active then 'active' else 'inactive' end
                       from clients c where lower(c.name) = lower(w.name) limit 1), 'missing')
         else
           coalesce((select case when s.is_active then 'active' else 'inactive' end
                       from subjects s where lower(s.name) = lower(w.name) limit 1), 'missing')
       end as state
from wanted w
order by state, kind, w.name;


-- ═══ STEP 2 — SEED (writes) ══════════════════════════════════════════════
-- Idempotent and safe to re-run: it inserts only what is missing and
-- reactivates only what is switched off. It never renames, never deletes, and
-- never touches a row that is already active.
--
-- MATCHED CASE-INSENSITIVELY, INSERTED AS TYPED. `clients.name` and
-- `subjects.name` are UNIQUE but case-SENSITIVE, so a plain
-- ON CONFLICT DO NOTHING would happily add "BSS" alongside an existing "bss"
-- and the picker would show both. The `not exists (… lower(…) = lower(…))`
-- guard is what prevents that.
--
-- NOTHING HERE TOUCHES EXISTING TASKS. These tables only decide what the
-- pickers OFFER. Tasks already filed under any name keep it regardless.

begin;

with wanted(name) as (
  select * from unnest(array[
    'AICL','Altus Corp','Aria Aerial','Arihant Lubricants','Bellavita','BSS',
    'Carbide India','Crish Metalworks','Dharav Enterprises','Ehara Engineering',
    'JMT Drive Solutions','Manan Vasa','Mitul Mehta - Self','Niaa Jewels',
    'Nirman Corp','Prime Graphite','PSO','Raj - Test','Saaro','Sattva Logistics',
    'Stellary','Sukhson','VPinnacle'
  ])
)
insert into clients (name, is_active)
select w.name, true
from wanted w
where not exists (select 1 from clients c where lower(c.name) = lower(w.name));

update clients set is_active = true, updated_at = now()
where is_active = false
  and lower(name) in (
    'aicl','altus corp','aria aerial','arihant lubricants','bellavita','bss',
    'carbide india','crish metalworks','dharav enterprises','ehara engineering',
    'jmt drive solutions','manan vasa','mitul mehta - self','niaa jewels',
    'nirman corp','prime graphite','pso','raj - test','saaro','sattva logistics',
    'stellary','sukhson','vpinnacle'
  );

with wanted(name) as (
  select * from unnest(array[
    'Accounts','Admin','Altus Ecosystem','Altus Tribe App','App','Approvals',
    'Back Office','Billing','BSS','BSS App','Collaboration','Collection',
    'Consulting','CRM','Dashboard','Data','DCC','Documentation','Follow Ups',
    'Handholding','HR','Incentive','Insta Videos','Internal Development',
    'Interviews','Jodo','KPI','Marketing','MIS','Operations','Others','Pay U',
    'Personal','Project','PS','PS App','PS Manual','PSO','PSO App','Recruitment',
    'Red Flag','Reimbursement','Sales','Social Media','SOP','System','Systems',
    'Tally','Test','Training','Website'
  ])
)
insert into subjects (name, is_active)
select w.name, true
from wanted w
where not exists (select 1 from subjects s where lower(s.name) = lower(w.name));

update subjects set is_active = true, updated_at = now()
where is_active = false
  and lower(name) in (
    'accounts','admin','altus ecosystem','altus tribe app','app','approvals',
    'back office','billing','bss','bss app','collaboration','collection',
    'consulting','crm','dashboard','data','dcc','documentation','follow ups',
    'handholding','hr','incentive','insta videos','internal development',
    'interviews','jodo','kpi','marketing','mis','operations','others','pay u',
    'personal','project','ps','ps app','ps manual','pso','pso app','recruitment',
    'red flag','reimbursement','sales','social media','sop','system','systems',
    'tally','test','training','website'
  );

commit;


-- ═══ STEP 3 — CONFIRM (read-only, run on its own) ════════════════════════
-- Re-run STEP 1. Every row should now read `active`.
--
-- ⏳ THE PICKER CAN LAG BY UP TO 10 MINUTES. Both lists are wrapped in
--    unstable_cache with a 600s revalidate (lib/queries/clients.ts,
--    lib/queries/subjects.ts). The write paths inside the app invalidate the
--    cache tag; a hand-written INSERT in the SQL editor cannot, so the new
--    names appear when the entry ages out. To see them immediately, redeploy —
--    a new deployment starts with a cold cache.
