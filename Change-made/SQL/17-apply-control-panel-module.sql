-- ===========================================================================
--  APPLY — Control Panel becomes a module of its own
--  Altus WMS | branch Om | migration 0251 | applied 2026-09-24
-- ===========================================================================
--
--  WHAT THIS DOES
--    Moves the Control Panel's stored permission nodes from the old
--    `admin.*` keys to the new top-level `control-panel.*` keys.
--
--    The screens moved from /admin/control-panel/* to /control-panel/*, and the
--    permission catalogue requires a child key to be prefixed by its parent's —
--    so `admin.control-panel.users` cannot be a child of `control-panel`. The
--    keys had to change, and these two tables store them.
--
--    · module_permissions  per-employee show/view/edit overrides
--    · role_permissions    the same node keys, granted through a role template
--
--  WHY NOTHING IS LOST
--    Every row is MOVED, not dropped. There is no DELETE and none is needed:
--    the destination keys are new by construction — nothing in the catalogue
--    ever defined them — so no row can already hold one and the unique indexes
--    on (employee_id, node_key) and (role_id, node_key, action, scope) cannot
--    collide.
--
--  IDEMPOTENT. Re-running finds no rows under the old keys and changes nothing.
--  DATA ONLY — no DDL, no table created, altered or dropped.
--
--  Run 18-verify-control-panel-module.sql afterwards. Every query there is
--  read-only and expects 0 rows.
-- ===========================================================================

do $$
begin
  -- ── Per-employee module overrides ────────────────────────────────────────
  if to_regclass('public.module_permissions') is not null then
    update module_permissions
       set node_key = case node_key
             when 'admin.control-panel'                  then 'control-panel'
             when 'admin.control-panel.users'            then 'control-panel.users'
             when 'admin.control-panel.roles'            then 'control-panel.roles'
             when 'admin.control-panel.permissions'      then 'control-panel.permissions'
             when 'admin.control-panel.effective-access' then 'control-panel.effective-access'
             when 'admin.temporary-access'               then 'control-panel.temporary-access'
           end
     where node_key in (
       'admin.control-panel',
       'admin.control-panel.users',
       'admin.control-panel.roles',
       'admin.control-panel.permissions',
       'admin.control-panel.effective-access',
       'admin.temporary-access'
     );
  end if;

  -- ── Role templates ───────────────────────────────────────────────────────
  if to_regclass('public.role_permissions') is not null then
    update role_permissions
       set node_key = case node_key
             when 'admin.control-panel'                  then 'control-panel'
             when 'admin.control-panel.users'            then 'control-panel.users'
             when 'admin.control-panel.roles'            then 'control-panel.roles'
             when 'admin.control-panel.permissions'      then 'control-panel.permissions'
             when 'admin.control-panel.effective-access' then 'control-panel.effective-access'
             when 'admin.temporary-access'               then 'control-panel.temporary-access'
           end
     where node_key in (
       'admin.control-panel',
       'admin.control-panel.users',
       'admin.control-panel.roles',
       'admin.control-panel.permissions',
       'admin.control-panel.effective-access',
       'admin.temporary-access'
     );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- STAMP IT IN THE LEDGER
-- ---------------------------------------------------------------------------
--  Only needed if you are applying this BY HAND. `pnpm db:migrate` and
--  scripts/apply-one-migration.ts both write this row for you, and running it
--  twice is harmless (the primary key is the filename).
--
-- insert into __schema_applied (filename)
-- values ('0251_control_panel_module.sql')
-- on conflict (filename) do nothing;


-- ---------------------------------------------------------------------------
-- THE URLS, FOR THE RECORD (not SQL)
-- ---------------------------------------------------------------------------
--  The old paths still answer, from redirects() in next.config.ts:
--    /admin/control-panel/*    ->  /control-panel/*
--    /admin/temporary-access   ->  /control-panel/temporary-access
-- ---------------------------------------------------------------------------
