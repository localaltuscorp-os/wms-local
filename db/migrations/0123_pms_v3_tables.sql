-- WS-2 — PMS v3: subjective scoring (0-10, dual justifications, Manan-only),
-- X-Factor (evidence-backed extra points), Constitution para-by-para scoring,
-- and the singleton config (weights/bands/blend — nothing hardcoded).
-- Additive + idempotent. Inert until PMS_V3 is flipped on. Mirrors the drizzle
-- defs in lib/pms/v3/schema.ts exactly.

create table if not exists pms_v3_config (
  id            text primary key default 'default',
  config        jsonb not null default '{}'::jsonb,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at    timestamptz not null default now()
);
insert into pms_v3_config (id) values ('default') on conflict (id) do nothing;

create table if not exists pms_subjective_score (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references employees(id) on delete cascade,
  period        text not null,          -- 'YYYY-MM'
  rater_role    text not null,          -- self | manager | manan
  rater_id      uuid references employees(id) on delete set null,
  factor_key    text not null,
  points        smallint,               -- 0..10
  justify_given text,                    -- Q1 (Manan-only)
  justify_taken text,                    -- Q2 (Manan-only)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists pms_subjective_subj_period_role_factor_uq
  on pms_subjective_score(subject_id, period, rater_role, factor_key);
create index if not exists pms_subjective_subject_idx on pms_subjective_score(subject_id, period);

create table if not exists pms_xfactor (
  id                 uuid primary key default gen_random_uuid(),
  subject_id         uuid not null references employees(id) on delete cascade,
  period             text not null,
  points             numeric(6,2) not null default 0,
  evidence_kind      text not null,     -- recording | transcript
  evidence_url       text,
  transcript_summary text,
  note               text,
  added_by_id        uuid references employees(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists pms_xfactor_subject_idx on pms_xfactor(subject_id, period);

create table if not exists pms_constitution_para (
  id         uuid primary key default gen_random_uuid(),
  position   integer not null,
  is_heading boolean not null default false,
  title      text,
  body       text not null,
  weight     numeric(6,2) not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pms_constitution_para_pos_idx on pms_constitution_para(position);

create table if not exists pms_constitution_score (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references employees(id) on delete cascade,
  period     text not null,
  para_id    uuid not null references pms_constitution_para(id) on delete cascade,
  rater_role text not null,             -- admin | self
  rater_id   uuid references employees(id) on delete set null,
  points     smallint,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pms_constitution_score_subj_period_para_role_uq
  on pms_constitution_score(subject_id, period, para_id, rater_role);
create index if not exists pms_constitution_score_subject_idx on pms_constitution_score(subject_id, period);
