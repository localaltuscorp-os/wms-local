-- Part 2 master cleanup. Keep referenced financial rows inactive when removal
-- would break history; remove unreferenced rows.

ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS display_name text;

DO $$
DECLARE
  wanted text[] := ARRAY[
    'Accounts', 'Admin', 'OS App', 'Altus Tribe App', 'Approvals', 'Back Office', 'Billing', 'BSS', 'BSS App', 'Collaboration', 'Collection', 'Consulting', 'Altus CRM', 'Dashboard', 'Data', 'Compliance', 'CC', 'Documentation', 'Handholding', 'HR', 'Incentive', 'Insta Videos', 'Internal Devp', 'Interviews', 'Jodo', 'Pay U', 'KPI', 'Marketing', 'MIS', 'Internal Ops', 'Others', 'Personal', 'Projects', 'PS', 'PS App', 'PS Manual', 'PSO', 'PSO App', 'Recruitment', 'Red Flag', 'Reimbursement', 'Sales', 'Social Media', 'SOP', 'Systems', 'Tally', 'Test', 'Training', 'Website', 'Control Panel', 'Admin Panel', 'WMS App', 'Goals App', 'Billing App', 'HR App', 'Sales App', 'Performance App', 'Accounts App', 'Employees App', 'Operations App', 'Incentives App', 'Projects App', 'Journal App', 'Habit Tracker App'
  ];
  item text;
BEGIN
  DELETE FROM subjects WHERE name <> ALL(wanted);
  FOREACH item IN ARRAY wanted LOOP
    INSERT INTO subjects (name, is_active, sort_order) VALUES (item, true, 100)
    ON CONFLICT (name) DO UPDATE SET is_active = true, updated_at = now();
  END LOOP;
END $$;

UPDATE outstanding_products SET display_name = 'Productivity Shastra Orientation' WHERE name = 'PSO' OR code = 'PSO';
UPDATE outstanding_products SET display_name = 'Business Scale Up Shastra Orientation' WHERE name = 'BSSO' OR code = 'BSSO';
UPDATE outstanding_products SET display_name = 'Operating System' WHERE code = 'OS';
UPDATE outstanding_products SET display_name = 'Altus Conclave' WHERE name = 'AC' OR code = 'AC';
UPDATE outstanding_products p SET code = 'PSO' WHERE p.name = 'PSO' AND p.code IS NULL AND NOT EXISTS (SELECT 1 FROM outstanding_products x WHERE lower(x.code) = 'pso');
UPDATE outstanding_products p SET code = 'PS' WHERE p.name = 'PS' AND p.code IS NULL AND NOT EXISTS (SELECT 1 FROM outstanding_products x WHERE lower(x.code) = 'ps');
UPDATE outstanding_products p SET code = 'BSSO' WHERE p.name = 'BSSO' AND p.code IS NULL AND NOT EXISTS (SELECT 1 FROM outstanding_products x WHERE lower(x.code) = 'bsso');
UPDATE outstanding_products p SET code = 'BSS' WHERE p.name = 'BSS' AND p.code IS NULL AND NOT EXISTS (SELECT 1 FROM outstanding_products x WHERE lower(x.code) = 'bss');
UPDATE outstanding_products p SET code = 'AC' WHERE p.name = 'AC' AND p.code IS NULL AND NOT EXISTS (SELECT 1 FROM outstanding_products x WHERE lower(x.code) = 'ac');

DELETE FROM outstanding_payment_modes WHERE name IN ('Altus Kotak', 'Altus Corp', 'MJV HUF', 'CMV Gpay', 'CMV G Pay');

DO $$
DECLARE
  wanted text[] := ARRAY['PSO', 'PS', 'BSSO', 'BSS', 'Retainer', 'OS App', 'Inhouse PS', 'AC', 'Rent', 'Commission', 'Key Note', '2-Day', 'Billing'];
  item text;
BEGIN
  DELETE FROM outstanding_products p
  WHERE p.name <> ALL(wanted)
    AND NOT EXISTS (SELECT 1 FROM outstanding_contracts c WHERE c.product_id = p.id);
  UPDATE outstanding_products p SET is_active = false, updated_at = now()
  WHERE p.name <> ALL(wanted);
  FOREACH item IN ARRAY wanted LOOP
    INSERT INTO outstanding_products (name, is_active, is_billable, sort_order) VALUES (item, true, true, 100)
    ON CONFLICT (name) DO UPDATE SET is_active = true, updated_at = now();
  END LOOP;
END $$;

INSERT INTO paying_entities (name, is_active, sort_order)
VALUES ('Smita Raut', true, 100), ('Sunil Raut', true, 100), ('Parvez Khan', true, 100), ('Dattaram Kap', true, 100), ('Colour Graphics', true, 100)
ON CONFLICT (name) DO UPDATE SET is_active = true, updated_at = now();

INSERT INTO billing_entity_profiles (entity_id, paying_entity_id, legal_name)
SELECT lower(regexp_replace(pe.name, '[^a-zA-Z0-9]+', '-', 'g')), pe.id, pe.name
FROM paying_entities pe
WHERE pe.name IN ('Smita Raut', 'Sunil Raut', 'Parvez Khan', 'Dattaram Kap', 'Colour Graphics')
  AND NOT EXISTS (SELECT 1 FROM billing_entity_profiles bp WHERE bp.paying_entity_id = pe.id);
