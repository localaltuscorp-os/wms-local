-- 0093 — Weekly-goal daily actuals + weight even-split backfill.
-- Idempotent. Safe to re-run.

create table if not exists weekly_goal_actuals (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references weekly_goals(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  entry_date    date not null,
  pct           integer,
  note          text,
  created_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists weekly_goal_actuals_uq on weekly_goal_actuals (goal_id, entry_date);
create index if not exists weekly_goal_actuals_emp_date_idx on weekly_goal_actuals (employee_id, entry_date);

-- Weight model change: weights now represent each goal's SHARE and must sum to
-- exactly 100 per (employee, week). Existing data has weight=100 on every goal
-- (the old per-goal default), which would sum to N*100 and surprise-block
-- managers on the first Monday gate. Even-split the CURRENT and NEXT week's
-- active goals per (employee, week_start) so existing data already sums to 100.
-- Remainder (100 mod count) is added to the earliest-position goals.
do $$
declare
  grp record;
  g record;
  base int;
  rem int;
  i int;
begin
  for grp in
    select employee_id, week_start, count(*)::int as cnt
    from weekly_goals
    where archived = false
      and week_start in (
        -- current week's Monday (IST) and next week's Monday
        (date_trunc('week', (now() at time zone 'Asia/Kolkata'))::date),
        (date_trunc('week', (now() at time zone 'Asia/Kolkata'))::date + 7)
      )
    group by employee_id, week_start
    having count(*) > 0
  loop
    base := 100 / grp.cnt;
    rem := 100 - base * grp.cnt;
    i := 0;
    for g in
      select id from weekly_goals
      where employee_id = grp.employee_id and week_start = grp.week_start and archived = false
      order by position, created_at
    loop
      update weekly_goals
        set weight = base + (case when i < rem then 1 else 0 end), updated_at = now()
      where id = g.id;
      i := i + 1;
    end loop;
  end loop;
end $$;
