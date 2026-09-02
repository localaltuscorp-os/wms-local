-- 0092 — Ambassadors: Partner Relationship Intelligence (Sales workspace).
-- Idempotent. Safe to re-run. See the design spec for the data model.

-- ── Products lookup ─────────────────────────────────────────────────────────
create table if not exists amb_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists amb_products_active_idx on amb_products (is_active, sort_order, name);

-- ── Ambassadors (external partners) ─────────────────────────────────────────
create table if not exists amb_ambassadors (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  company              text,
  email                text,
  phone                text,
  photo_url            text,
  owner_id             uuid references employees(id) on delete set null,
  status               text not null default 'active',
  tier                 text,
  partner_score        numeric(6,2),
  score_updated_at     timestamptz,
  payout_type          text not null default 'percent',
  payout_value         numeric(14,2) not null default 0,
  payout_terms_notes   text,
  monthly_target       numeric(14,2),
  monthly_target_count integer,
  joined_on            date,
  source               text,
  ai_summary           text,
  ai_summary_at        timestamptz,
  archived             boolean not null default false,
  created_by_id        uuid references employees(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists amb_ambassadors_status_idx on amb_ambassadors (archived, status);
create index if not exists amb_ambassadors_owner_idx on amb_ambassadors (owner_id);

-- ── Ambassador ↔ products (which products each pitches) ─────────────────────
create table if not exists amb_ambassador_products (
  id            uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references amb_ambassadors(id) on delete cascade,
  product_id    uuid not null references amb_products(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create unique index if not exists amb_ambassador_products_uq on amb_ambassador_products (ambassador_id, product_id);

-- ── Referrals (the deal pipeline) ───────────────────────────────────────────
create table if not exists amb_referrals (
  id                 uuid primary key default gen_random_uuid(),
  ambassador_id      uuid not null references amb_ambassadors(id) on delete cascade,
  prospect_name      text not null,
  prospect_company   text,
  prospect_phone     text,
  prospect_email     text,
  prospect_notes     text,
  received_on        date not null default current_date,
  stage              text not null default 'received',
  assigned_to_id     uuid references employees(id) on delete set null,
  product_id         uuid references amb_products(id) on delete set null,
  deal_amount        numeric(14,2),
  outcome            text not null default 'open',
  expected_close     date,
  won_at             timestamptz,
  lost_reason        text,
  commission_amount  numeric(14,2),
  commission_basis   text,
  commission_status  text not null default 'pending',
  client_id          uuid references clients(id) on delete set null,
  pg_introduction_id uuid references pg_introductions(id) on delete set null,
  created_by_id      uuid references employees(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists amb_referrals_ambassador_idx on amb_referrals (ambassador_id);
create index if not exists amb_referrals_stage_idx on amb_referrals (stage);
create index if not exists amb_referrals_outcome_idx on amb_referrals (outcome);
create index if not exists amb_referrals_commission_idx on amb_referrals (commission_status);
create index if not exists amb_referrals_received_idx on amb_referrals (received_on);

-- ── Payout ledger + settle join ─────────────────────────────────────────────
create table if not exists amb_payouts (
  id            uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references amb_ambassadors(id) on delete cascade,
  amount        numeric(14,2) not null,
  paid_on       date not null default current_date,
  method        text,
  reference     text,
  note          text,
  created_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists amb_payouts_ambassador_idx on amb_payouts (ambassador_id, paid_on);

create table if not exists amb_payout_referrals (
  id             uuid primary key default gen_random_uuid(),
  payout_id      uuid not null references amb_payouts(id) on delete cascade,
  referral_id    uuid not null references amb_referrals(id) on delete cascade,
  amount_applied numeric(14,2) not null,
  created_at     timestamptz not null default now()
);
create unique index if not exists amb_payout_referrals_uq on amb_payout_referrals (payout_id, referral_id);

-- ── Unified activity timeline (notes/calls/meetings/reminders/system) ───────
create table if not exists amb_activities (
  id            uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references amb_ambassadors(id) on delete cascade,
  referral_id   uuid references amb_referrals(id) on delete cascade,
  type          text not null,
  title         text,
  body          text,
  occurred_at   timestamptz not null default now(),
  remind_at     timestamptz,
  done          boolean not null default false,
  created_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists amb_activities_ambassador_idx on amb_activities (ambassador_id, occurred_at);
create index if not exists amb_activities_remind_idx on amb_activities (remind_at);

-- ── Version-controlled documents ────────────────────────────────────────────
create table if not exists amb_documents (
  id            uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references amb_ambassadors(id) on delete cascade,
  name          text not null,
  version       integer not null default 1,
  storage_key   text not null,
  mime          text,
  size_bytes    bigint,
  supersedes_id uuid references amb_documents(id) on delete set null,
  uploaded_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists amb_documents_ambassador_idx on amb_documents (ambassador_id, name, version);

-- ── Cross-module: backlink a follow-up task to its referral ─────────────────
alter table tasks add column if not exists amb_referral_id uuid;
create index if not exists tasks_amb_referral_idx on tasks (amb_referral_id);

-- ── Seed a starter product list (idempotent) ────────────────────────────────
insert into amb_products (name, sort_order)
select v.name, v.ord from (values
  ('BSU (Business Scale Up)', 10),
  ('PS (Personal Success)', 20),
  ('JITO', 30),
  ('Consulting', 40),
  ('Training', 50)
) as v(name, ord)
where not exists (select 1 from amb_products p where lower(p.name) = lower(v.name));
