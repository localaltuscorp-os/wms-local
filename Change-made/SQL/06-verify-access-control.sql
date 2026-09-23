-- ============================================================================
-- 06 — Read-only verification for the Access Control work (changes 09 and 10).
--
-- Nothing here writes. Run it after 05-apply-access-control.sql to confirm the
-- table, its indexes and the grants in force. An empty grant list is the
-- correct starting state: everybody then sees their own work and their own
-- earnings, plus their downline — and nothing else.
-- ============================================================================

-- 1. The table and its columns exist.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'visibility_grants'
ORDER BY ordinal_position;

-- 2. The three indexes exist (the pair, the org-wide partial, the lookup).
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'visibility_grants'
ORDER BY indexname;

-- 3. The old, Tasks-only table is gone (or was renamed in step 2 of the apply).
--    EXPECT: zero rows.
SELECT to_regclass('public.task_view_grants') AS old_table_should_be_null;

-- 4. The grants currently in force, per domain, with names, so one can be read
--    aloud.
SELECT g.domain,
       g.created_at::date                          AS granted_on,
       who.name                                    AS person,
       COALESCE(tgt.name, '(whole organisation)')  AS may_see,
       by_who.name                                 AS granted_by,
       g.note
FROM visibility_grants g
LEFT JOIN employees who    ON who.id = g.employee_id
LEFT JOIN employees tgt    ON tgt.id = g.target_id
LEFT JOIN employees by_who ON by_who.id = g.granted_by_id
ORDER BY g.domain, g.created_at DESC;

-- 5. Sanity: no grant makes somebody their own target (the screen refuses it;
--    this reports it if one ever arrived another way). EXPECT: 0.
SELECT count(*) AS self_targeted_grants
FROM visibility_grants
WHERE target_id = employee_id;

-- 6. Sanity: no duplicate grant for one (domain, person, target). EXPECT: 0.
SELECT count(*) AS duplicate_grants FROM (
  SELECT domain, employee_id, target_id
  FROM visibility_grants
  GROUP BY domain, employee_id, target_id
  HAVING count(*) > 1
) d;

-- ============================================================================
-- A NOTE ON WHAT IS *NOT* HERE.
--
-- Upload Master (change 08) reads the `template_files` table for its list of
-- replaced templates. That table already exists in production; the template
-- REGISTRY is code (lib/templates/registry.ts), so adding a template needs no
-- SQL at all. A template the registry knows and the table has no row for is
-- simply served as its built-in.
-- ============================================================================
