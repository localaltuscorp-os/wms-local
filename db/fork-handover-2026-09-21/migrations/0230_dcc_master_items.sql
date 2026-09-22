-- 0230 — DCC Masters: a Daily Compliance template per POSITION.
--
-- The account holder asked (2026-09-15) for DCC to work the way the Job
-- Description does — a master for a position, plus a specific DCC for an
-- employee. "Position" is the employee's DESIGNATION (employees.designation_id),
-- the one already set for 20 of 23 people.
--
-- LIVE-LINKED. Every active employee holding a designation carries one real KPI
-- (`dcc_kpi_items`) per active master item of that designation, so filling,
-- history, the dashboard, the 10 PM report and the calendar all work unchanged.
-- lib/dcc/master-sync.ts keeps them in step: a master edit updates every holder,
-- a retired master KPI is archived (history kept), and a change of designation
-- swaps one master's KPIs for the other's.
--
-- THE LINK IS ITS OWN TABLE, not a column on `dcc_kpi_items`: Drizzle names every
-- declared column in an INSERT, so a new column there would break adding a KPI
-- anywhere until this migration had been applied by hand. A KPI with no row here
-- is the employee's SPECIFIC DCC — including all ~260 that exist today.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists dcc_master_items (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references designations(id) on delete cascade,
  section text,
  code text,
  title text not null,
  frequency text,
  target_number numeric(14, 2),
  unit text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dcc_master_items_designation_idx
  on dcc_master_items (designation_id, is_active, sort_order);

create table if not exists dcc_master_links (
  item_id uuid primary key references dcc_kpi_items(id) on delete cascade,
  master_item_id uuid not null references dcc_master_items(id) on delete cascade,
  owner_employee_id uuid not null references employees(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One linked KPI per person per master item: what stops a double sync from
-- giving somebody the same KPI twice.
create unique index if not exists dcc_master_links_owner_master_uq
  on dcc_master_links (owner_employee_id, master_item_id);
