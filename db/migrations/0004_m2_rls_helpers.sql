-- M2.0 — RLS helper functions in app schema
-- Idempotent: safe to re-run.

create schema if not exists app;

create or replace function app.current_employee_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select id from employees
  where firebase_uid = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
$$;

create or replace function app.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(is_admin, false)
  from employees
  where firebase_uid = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
$$;

grant execute on function app.current_employee_id() to authenticated, anon;
grant execute on function app.is_admin() to authenticated, anon;
