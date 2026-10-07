-- 0267 · EMPLOYEE MASTER FUNCTION AND DESIGNATION VALUES
--
-- Keep Employee Master selectors backed by the Admin → Dropdown masters.
-- Desired rows are upserted in display order. Legacy rows remain active when
-- employees still reference them, so existing records never lose a label.

DO $$
DECLARE
  function_names text[] := ARRAY[
    'Founder Office', 'Handholding', 'Apps', 'Sales', 'Marketing',
    'Social Media', 'Accounts', 'Admin', 'HR', 'Consulting', 'CRM'
  ];
  designation_names text[] := ARRAY[
    'Intern - First Year',
    'Intern - Second Year',
    'Intern - Third Year',
    'Executive',
    'Sr. Executive',
    'Consultant',
    'Sr. Consultant',
    'Assistant Manager',
    'Deputy Manager',
    'Manager',
    'AVP',
    'DVP',
    'VP',
    'SVP',
    'President',
    'Sr President',
    'AGM',
    'GM',
    'Sr GM',
    'Associate Director',
    'Deputy Director',
    'Senior Director',
    'CEO',
    'Managing Director',
    'Chairman'
  ];
  item text;
  item_order integer;
  item_index integer;
BEGIN
  FOR item_index IN 1..cardinality(function_names) LOOP
    item := function_names[item_index];
    item_order := item_index * 10;
    INSERT INTO functions (name, is_active, sort_order)
    VALUES (item, true, item_order)
    ON CONFLICT (lower(name)) DO UPDATE
      SET is_active = true, sort_order = EXCLUDED.sort_order, updated_at = now();
  END LOOP;

  FOR item_index IN 1..cardinality(designation_names) LOOP
    item := designation_names[item_index];
    item_order := item_index * 10;
    INSERT INTO designations (name, is_active, sort_order, employee_type)
    VALUES (item, true, item_order,
      CASE WHEN item LIKE 'Intern - %' THEN 'intern' ELSE 'employee' END)
    ON CONFLICT (name) DO UPDATE
      SET is_active = true,
          sort_order = EXCLUDED.sort_order,
          employee_type = EXCLUDED.employee_type,
          updated_at = now();
  END LOOP;

  -- Hide stale unused values without deleting them. Referenced legacy values
  -- stay active so current employees can still resolve and edit them.
  UPDATE functions f
  SET is_active = false, updated_at = now()
  WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(function_names) AS wanted(name)
      WHERE lower(wanted.name) = lower(f.name)
    )
    AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.department_id = f.id);

  UPDATE designations d
  SET is_active = false, updated_at = now()
  WHERE NOT (d.name = ANY (designation_names))
    AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.designation_id = d.id);
END $$;
