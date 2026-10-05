-- Part 1: Dropdown People and Client master data.
-- Existing rows outside requested designation list are removed only when unused.

DO $$
DECLARE
  wanted text[] := ARRAY[
    'Intern - First Year', 'Intern - Second Year', 'Intern - Third Year',
    'Executive', 'Sr. Executive', 'Consultant', 'Sr. Consultant',
    'Assistant Manager', 'Deputy Manager', 'Manager',
    'Associate Vice President', 'Deputy Vice President', 'Vice President',
    'Senior Vice President', 'President', 'Sr President',
    'Assistant General Manager', 'General Manager', 'Sr. General Manager',
    'Associate Director', 'Deputy Director', 'Director', 'Senior Director',
    'CEO', 'Managing Director', 'Chairman'
  ];
  item text;
BEGIN
  FOREACH item IN ARRAY wanted LOOP
    INSERT INTO designations (name, is_active, sort_order, employee_type)
    VALUES (item, true, 100, CASE WHEN item LIKE 'Intern - %' THEN 'intern' ELSE 'employee' END)
    ON CONFLICT (name) DO UPDATE SET is_active = true, employee_type = EXCLUDED.employee_type, updated_at = now();
  END LOOP;

  DELETE FROM designations d
  WHERE d.name <> ALL(wanted)
    AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.designation_id = d.id);
END $$;

DELETE FROM clients
WHERE lower(name) IN (
  'bellavita', 'dharav ent', 'mittul mehta self', 'niaa', 'nirman corp',
  'raj test', 'saaro', 'vpinnacle', 'sukhson', 'stellary',
  'arihant lubricants', 'aria aerial', 'carbide india', 'crish metalwork',
  'ehara engg', 'niaa jewels'
);

INSERT INTO client_locations (name, address, is_active)
SELECT v.name, v.address, true
FROM (VALUES
  ('Arihant', 'Ramdev Plaza, Kashimira, Mira Road East, Mira Bhayandar, Maharashtra 401107'),
  ('GreenCell', 'Unit No. 405, 4th Floor, E Wing, Corporate Avenue, New A. K. Link Road, Chakala, Andheri East, Mumbai, Maharashtra 400099'),
  ('Ehara Industries', 'Government Industrial Estate, 94AB, opposite Sahyadri Nagar, Kandivali, Charkop Industrial Estate, Kandivali West, Mumbai, Maharashtra 400067'),
  ('NMD', 'Soraa Building, 65/1, Satpur MIDC Rd, opp. Bosch Company, MIDC, Satpur Colony, Nashik, Maharashtra 422007'),
  ('PMI', 'E-47, MIDC, Satpur Colony, Nashik, Maharashtra 422007')
) AS v(name, address)
WHERE NOT EXISTS (SELECT 1 FROM client_locations c WHERE lower(c.name) = lower(v.name));

UPDATE client_locations c
SET address = v.address, is_active = true, updated_at = now()
FROM (VALUES
  ('Arihant', 'Ramdev Plaza, Kashimira, Mira Road East, Mira Bhayandar, Maharashtra 401107'),
  ('GreenCell', 'Unit No. 405, 4th Floor, E Wing, Corporate Avenue, New A. K. Link Road, Chakala, Andheri East, Mumbai, Maharashtra 400099'),
  ('Ehara Industries', 'Government Industrial Estate, 94AB, opposite Sahyadri Nagar, Kandivali, Charkop Industrial Estate, Kandivali West, Mumbai, Maharashtra 400067'),
  ('NMD', 'Soraa Building, 65/1, Satpur MIDC Rd, opp. Bosch Company, MIDC, Satpur Colony, Nashik, Maharashtra 422007'),
  ('PMI', 'E-47, MIDC, Satpur Colony, Nashik, Maharashtra 422007')
) AS v(name, address)
WHERE lower(c.name) = lower(v.name);
