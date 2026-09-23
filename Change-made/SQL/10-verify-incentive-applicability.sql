-- ===========================================================================
--  VERIFY — Incentive applicability, intern employee type, internship dates
--  Altus WMS | branch Om | read-only. Run BEFORE and AFTER
--  Change-made/SQL/09-apply-incentive-applicability.sql.
-- ===========================================================================
--
--  Nothing here writes. Every query answers one question you can compare
--  against the numbers recorded below, which were read off the Supabase
--  database this branch points at on 2026-09-22, immediately after 0244 ran.

-- ---------------------------------------------------------------------------
-- 1. THE REPAIR (section 0). Expect `catalog_id` and NOT `incentive_id`.
--    Before the fix this returned `incentive_id` and the whole Incentive Master
--    screen failed with: column "catalog_id" does not exist (42703).
-- ---------------------------------------------------------------------------
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'incentive_eligibility'
   and column_name in ('catalog_id', 'incentive_id');
-- after: catalog_id
-- (2026-09-22) catalog_id, 0 rows in the table

-- ---------------------------------------------------------------------------
-- 2. The indexes the repair leaves behind. Expect all four, and NOT
--    `incentive_eligibility_pair_uq` (that was the old table's bare unique
--    index, which forbids re-adding somebody who was removed).
-- ---------------------------------------------------------------------------
select indexname
  from pg_indexes
 where tablename = 'incentive_eligibility'
 order by indexname;
-- (2026-09-22) incentive_eligibility_catalog_idx, incentive_eligibility_current_uq,
--              incentive_eligibility_employee_idx, incentive_eligibility_pkey

-- ---------------------------------------------------------------------------
-- 3. The foreign key 0232 declared and the old table never had.
-- ---------------------------------------------------------------------------
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'incentive_eligibility'::regclass
   and contype = 'f'
 order by conname;

-- ---------------------------------------------------------------------------
-- 4. THE FIVE NEW COLUMNS. Expect five rows.
-- ---------------------------------------------------------------------------
select table_name, column_name, is_generated, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'employees' and column_name in ('employee_type', 'internship_start', 'internship_end'))
     or (table_name = 'designations' and column_name = 'employee_type')
     or (table_name = 'incentive_catalog' and column_name = 'applicability')
   )
 order by table_name, column_name;
-- (2026-09-22) 5 rows; internship_end is_generated = ALWAYS

-- ---------------------------------------------------------------------------
-- 5. THE AUDIENCE TRANSLATION (§2). Read this against the pre-flight query in
--    the migration's header: no scheme may have changed audience.
--
--    ALL_EMPLOYEES with sales_eligible = true  → the schemes that reached every
--                                                non-intern employee (6)
--    SELECTED_EMPLOYEES with sales_eligible false/NULL → the schemes governed
--                                                by named rows, or reaching
--                                                nobody (14)
-- ---------------------------------------------------------------------------
select applicability,
       coalesce(sales_eligible, false) as sales_eligible_flag,
       count(*)                        as schemes
  from incentive_catalog
 group by 1, 2
 order by 1, 2;
-- (2026-09-22) ALL_EMPLOYEES/true = 6, SELECTED_EMPLOYEES/false = 14

-- ---------------------------------------------------------------------------
-- 6. The two new request types (§4). Expect the CHECK to list seven values.
-- ---------------------------------------------------------------------------
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conname = 'incentive_catalog_type_chk';
-- (2026-09-22) allows bss_conversion, sales_pitch, client_happiness,
--              group_intro, leads_referrals, breakthrough_idea,
--              employment_referral

-- ---------------------------------------------------------------------------
-- 7. THE INTERN MARKING (§8) — the ONE place designation text was ever matched.
--    Eyeball this list: anything wrongly marked is an editable master field at
--    /admin/designations, not a migration's last word.
-- ---------------------------------------------------------------------------
select name, employee_type
  from designations
 order by employee_type desc, name;
-- (2026-09-22) exactly one row marked intern: "Intern". All others 'employee'.

-- ---------------------------------------------------------------------------
-- 8. WHO ENDS UP BARRED FROM INCENTIVES (§7 + §1). Expect the designations
--    flagged intern, and the people sitting on them.
-- ---------------------------------------------------------------------------
select e.name, e.is_active, d.name as designation
  from employees e
  join designations d on d.id = e.designation_id
 where d.employee_type = 'intern'
 order by e.is_active desc, e.name;
-- (2026-09-22) 10 people on the Intern designation, 6 of them active.

-- ---------------------------------------------------------------------------
-- 9. THE ONE THING THAT WILL BLOCK SOMEBODY'S NEXT SAVE.
--    Probation End Date is now required for anybody who is not an intern, and
--    0244 deliberately does NOT backfill it. Every row below is an active,
--    non-intern employee who cannot be saved until HR sets a date on
--    /admin/employees. This is the intended "flag the legacy blanks" behaviour,
--    not a fault — but it is a list HR has to work through.
-- ---------------------------------------------------------------------------
select e.name, e.employee_code, d.name as designation
  from employees e
  left join designations d on d.id = e.designation_id
 where e.probation_end is null
   and e.is_active = true
   and coalesce(e.employee_type, d.employee_type, 'employee') <> 'intern'
 order by e.name;
-- (2026-09-22) 13 active non-intern employees: Dattaram Kap, Jeevan Bharambe,
--   Manan Vasa, Mansi Medhekar, Namrata Nevgi, Om Jadhav, Parvez Khan,
--   Prakash Kumawat, Raj Ragpasare, Rashmi Tripathi, Rohan Choudhary,
--   Ruchita Ambre, Rudra Thukarul.
