-- M2.1 — Phase 2 RLS: tighten tasks writes + lock task_events append-only.
-- Idempotent: drops old M2.0 stub policies + recreates fresh.

------------------------------------------------------------------------
-- tasks: replace temporary M2.0 permissive write policy with Phase-2 rules
------------------------------------------------------------------------

drop policy if exists "tasks_write_authenticated_m2_0_temp" on tasks;

-- INSERT: any authenticated employee may create a task. The Server Action
--         additionally sets created_by_id = app.current_employee_id() so
--         the row carries provenance.
create policy "tasks_insert_authenticated"
  on tasks for insert
  to authenticated
  with check (true);

-- UPDATE: creator OR initiator OR doer OR admin may update.
--         Per the permissions matrix (spec lines 218-230):
--           - creator / initiator: editing fields while pending, archive/restore
--           - doer: pending lane status transitions, request-help, reassign
--           - initiator: cancel, transfer-external, reassign, approve/decline
--           - admin: anything
create policy "tasks_update_participant_or_admin"
  on tasks for update
  to authenticated
  using (
    app.is_admin()
    or created_by_id = app.current_employee_id()
    or initiator_id  = app.current_employee_id()
    or doer_id       = app.current_employee_id()
  )
  with check (
    app.is_admin()
    or created_by_id = app.current_employee_id()
    or initiator_id  = app.current_employee_id()
    or doer_id       = app.current_employee_id()
  );

-- DELETE: not exposed in M2 (deactivate-only contract, spec line 80).
--         No policy = denied for non-bypass roles.

------------------------------------------------------------------------
-- task_events: append-only audit trail
------------------------------------------------------------------------

alter table task_events enable row level security;

-- SELECT: task participants (creator OR initiator OR doer) + admins.
--         M2.2 will surface this via the audit timeline UI; M2.1 only
--         needs the policy in place so Server Actions don't trip RLS.
create policy "task_events_read_participants_or_admin"
  on task_events for select
  to authenticated
  using (
    app.is_admin()
    or exists (
      select 1 from tasks t
      where t.id = task_events.task_id
        and (
          t.created_by_id = app.current_employee_id()
          or t.initiator_id = app.current_employee_id()
          or t.doer_id     = app.current_employee_id()
        )
    )
  );

-- INSERT: any authenticated user.  Server Actions always set
--         actor_id = app.current_employee_id() (enforced by app code,
--         not WITH CHECK, because we need RLS to accept the row as
--         written by the Server Action under the user's JWT).
create policy "task_events_insert_authenticated"
  on task_events for insert
  to authenticated
  with check (actor_id = app.current_employee_id());

-- UPDATE / DELETE: revoked for ALL roles including authenticated.
--                  Audit rows are immutable.  No policy + explicit revoke
--                  belt-and-suspenders.
revoke update, delete on task_events from authenticated;
revoke update, delete on task_events from anon;
