-- ════════════════════════════════════════════════════════════════════════════
-- CONTROL PANEL AS A TOP-LEVEL MODULE (0251)
--
-- The Control Panel left the Admin Panel and became a module of its own: its
-- screens moved from `/admin/control-panel/*` to `/control-panel/*`, and its
-- permission nodes moved from under `admin` to a top-level `control-panel`
-- node in the catalogue.
--
-- WHY THE KEYS ARE REWRITTEN, NOT LEFT ALONE
--   `module_permissions.node_key` and `role_permissions.node_key` store the
--   dotted catalogue path. The catalogue requires every child key to be
--   prefixed by its parent's (`permission-catalog.test.ts` asserts it), so
--   `admin.control-panel.users` cannot be a child of `control-panel`. The keys
--   have to become `control-panel.users` or the tree cannot describe the app.
--
-- WHY NOBODY LOSES ACCESS
--   Every stored grant is MOVED, not dropped — the rows are re-pointed at the
--   new key. There is no DELETE, and none is needed: the destination keys are
--   new by construction (nothing in the catalogue ever defined them), so no row
--   can already hold one and the unique indexes on
--   (employee_id, node_key) / (role_id, node_key, action, scope) cannot
--   collide. The whole file runs in ONE transaction, so a partial application —
--   the only way that reasoning could break — is not possible.
--
-- IDEMPOTENT. Re-running finds no rows under the old keys and changes nothing.
-- No DDL: no table is created, altered or dropped, and no column is touched.
-- ════════════════════════════════════════════════════════════════════════════

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
  -- Roles hold the same node keys, so a role that granted "Control Panel ·
  -- Roles" must keep granting it after the move.
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

-- THE HOSTED URL, for the record rather than for the migration: the old paths
-- still answer, from the routing layer, with a forward to the new ones. See the
-- Control Panel entries in next.config.ts's `redirects()`.
--   /admin/control-panel/*      -> /control-panel/*
--   /admin/temporary-access     -> /control-panel/temporary-access
