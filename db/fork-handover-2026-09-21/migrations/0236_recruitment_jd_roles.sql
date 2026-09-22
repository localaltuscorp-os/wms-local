-- 0236 — Recruitment JDs get their own role list.
--
-- 0232 keyed one JD to one row of `interview_positions`. That list is the
-- INTERVIEW GRADE ladder — Executive, Senior Manager, Consultant, First-Year
-- Intern — and it is the wrong key for this: the JDs Rutvisha wrote are per
-- HIRING ROLE (Sales Manager, Creative Intern, Back Office Executive), several
-- of them span two grades at once ("Senior Sales Manager / Sales Manager"), and
-- a grade like "Deputy Vice President" has no JD and never will.
--
-- So a recruitment JD is now identified by its own `slug`, carries its own
-- `title`, and `position_id` becomes an OPTIONAL link to the grade for anyone
-- who wants to tie the two together later.
--
-- Written as one self-contained, idempotent script because 0232 may or may not
-- have been applied in a given database — this repository applies migrations by
-- hand, and at the time of writing neither table existed in the live one.
--
--   master_content     the original — Rutvisha's JD. Changed only deliberately.
--   recruiter_content  what recruiters edit and send. NULL = identical to the
--                      master, so a master update flows through until someone
--                      edits the recruiter copy. "Reset to master" sets it NULL.

create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references interview_positions(id) on delete set null,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The new identity. Added separately so a database that already ran 0232 is
-- carried forward rather than rebuilt.
alter table recruitment_jds add column if not exists slug text;
alter table recruitment_jds add column if not exists title text;
alter table recruitment_jds add column if not exists sort_order integer not null default 100;
alter table recruitment_jds add column if not exists is_active boolean not null default true;

-- 0232 made position_id NOT NULL UNIQUE. Both have to go: a JD no longer needs
-- a grade, and two JDs may point at the same one.
alter table recruitment_jds alter column position_id drop not null;
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'recruitment_jds' and con.contype = 'u'
       and pg_get_constraintdef(con.oid) like '%(position_id)%'
  loop
    execute format('alter table recruitment_jds drop constraint %I', c);
  end loop;
end $$;

-- Backfill any row written under 0232 so the NOT NULL below can be taken.
update recruitment_jds jd
   set slug = coalesce(jd.slug, 'position-' || replace(jd.id::text, '-', '')),
       title = coalesce(jd.title, p.label, 'Untitled role')
  from interview_positions p
 where p.id = jd.position_id and (jd.slug is null or jd.title is null);
update recruitment_jds
   set slug = coalesce(slug, 'position-' || replace(id::text, '-', '')),
       title = coalesce(title, 'Untitled role')
 where slug is null or title is null;

alter table recruitment_jds alter column slug set not null;
alter table recruitment_jds alter column title set not null;

create unique index if not exists recruitment_jds_slug_uq on recruitment_jds (slug);
create index if not exists recruitment_jds_order_idx on recruitment_jds (sort_order, title);

-- Every send, recorded: what went out (a snapshot, since the JD can change
-- afterwards), to whom, how, and by whom. A WhatsApp send is 'opened' — the WMS
-- opens WhatsApp with the JD typed in and the recruiter presses Send there,
-- which the WMS cannot observe.
create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);
