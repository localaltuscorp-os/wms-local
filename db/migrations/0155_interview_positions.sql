-- 0155 — Interview Positions master (Candidate Interview Form → "Position Applied For").
-- Idempotent.

create table if not exists interview_positions (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists interview_positions_active_sort_idx
  on interview_positions (is_active, sort_order, label);

-- Seed the default position ladder (idempotent — keeps admin edits intact).
insert into interview_positions (label, sort_order) values
  ('First-Year Intern', 1),
  ('Second-Year Intern', 2),
  ('Executive', 3),
  ('Senior Executive', 4),
  ('Assistant Manager', 5),
  ('Deputy Manager', 6),
  ('Senior Manager', 7),
  ('Consultant', 8),
  ('Senior Consultant', 9),
  ('General Manager', 10),
  ('Assistant Vice President', 11),
  ('Deputy Vice President', 12),
  ('Senior Vice President', 13)
on conflict (label) do nothing;
