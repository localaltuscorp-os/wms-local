-- 0052 — client roster + task-data cleanup (2026-06-10).
--
-- Decisions (confirmed with Manan):
--   • REMOVE = deactivate in the `clients` roster (is_active=false) — reversible,
--     leaves task history untouched. The filter dropdown is being switched to
--     read the active roster, so deactivated names vanish from BOTH pickers.
--   • MERGE = reassign `tasks.client` from each spelling variant to its canonical
--     name (so those tasks consolidate + stay filterable), then deactivate the
--     variant's roster row. Backed up first (see client_cleanup_backup_0052) so a
--     bad merge is reversible.
--
-- Data-only + IDEMPOTENT — safe to run more than once (re-runs match nothing).
-- Applied via scripts/apply-client-cleanup.ts, NOT `pnpm db:migrate`.

-- ── Reversibility: snapshot every task we're about to re-client ───────────────
create table if not exists client_cleanup_backup_0052 (
  task_id      uuid,
  old_client   text,
  new_client   text,
  backed_up_at timestamptz not null default now()
);

-- Canonical merge map: variant (as stored) → canonical. lower(btrim()) match so
-- stray case/edge-whitespace variants fold in too.
insert into client_cleanup_backup_0052 (task_id, old_client, new_client)
select t.id, t.client, m.to_client
from tasks t
join (values
  ('Altus  corp','Altus Corp'),
  ('Altus','Altus Corp'),
  ('Altus Corpq','Altus Corp'),
  ('Alus Corp','Altus Corp'),
  ('Aktus Corp - BSU','Altus Corp'),
  ('Altus Vorp','Altus Corp'),
  ('Altus Corp & CG','Altus Corp'),
  ('PR & Company','Altus Corp'),
  ('Carbide','Carbide India'),
  ('Carbite India','Carbide India'),
  ('Alok Kanani','Carbide India'),
  ('Chouhan & Sons','Chowhan & Sons'),
  ('Chowhan and Sons','Chowhan & Sons'),
  ('Ehara','Ehara Engineering'),
  ('Soul Storii','Soul Storri'),
  ('Ajit Jain','Soul Storri'),
  ('AATech','AA Tech'),
  ('Colour Graphicsekyc','Colour Graphics'),
  ('Hys','HYS'),
  ('Vasa Fmaily','Vasa Family')
) as m(from_client, to_client)
  on lower(btrim(t.client)) = lower(m.from_client)
where t.client is distinct from m.to_client;

-- ── Apply the merges to tasks.client ─────────────────────────────────────────
update tasks t
   set client = m.to_client
from (values
  ('Altus  corp','Altus Corp'),
  ('Altus','Altus Corp'),
  ('Altus Corpq','Altus Corp'),
  ('Alus Corp','Altus Corp'),
  ('Aktus Corp - BSU','Altus Corp'),
  ('Altus Vorp','Altus Corp'),
  ('Altus Corp & CG','Altus Corp'),
  ('PR & Company','Altus Corp'),
  ('Carbide','Carbide India'),
  ('Carbite India','Carbide India'),
  ('Alok Kanani','Carbide India'),
  ('Chouhan & Sons','Chowhan & Sons'),
  ('Chowhan and Sons','Chowhan & Sons'),
  ('Ehara','Ehara Engineering'),
  ('Soul Storii','Soul Storri'),
  ('Ajit Jain','Soul Storri'),
  ('AATech','AA Tech'),
  ('Colour Graphicsekyc','Colour Graphics'),
  ('Hys','HYS'),
  ('Vasa Fmaily','Vasa Family')
) as m(from_client, to_client)
where lower(btrim(t.client)) = lower(m.from_client)
  and t.client is distinct from m.to_client;

-- ── Make sure every canonical target is present + active in the roster ───────
update clients set is_active = true, updated_at = now()
where lower(name) in (
  'altus corp','carbide india','chowhan & sons','ehara engineering',
  'soul storri','aa tech','colour graphics','hys','vasa family'
);

-- ── Deactivate the removed clients + the merged-away variants ─────────────────
update clients set is_active = false, updated_at = now()
where lower(name) in (
  -- explicit removes
  'abdeali kachwala','altus branding','atit shah','aveen shoes',
  'deep gada & hussain taiyab','deepak wagh','govind chaoudhary',
  'hussain rassai','pravesh kanther','ps participants','ps72',
  'ps74 ahsan contractor','pso 172 sales','rajputana','renovatia',
  'rushabh lathia','smita nair','stellery and niaa','suhas pawar',
  'supreet architect','swani','tally','tejas sanghani','vishal kakde',
  -- merged-away sources (now folded into a canonical)
  'alok kanani','ajit jain','ehara','altus corp & cg','altus vorp',
  'alus corp','altus  corp','pr & company','chowhan and sons',
  'colour graphicsekyc'
);
