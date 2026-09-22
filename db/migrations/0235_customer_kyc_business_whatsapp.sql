-- 0235 — Customer KYC: Business Category, Nature of Business, contact WhatsApp.
--
-- Manan, 2026-09-19: the Identity section gains "Business Category" (a
-- dropdown from the Customer Master DD list `business_category`) and "Nature
-- of Business" (optional free text); every contact person gains a WhatsApp
-- number, which the form can fill with "same as contact no".
--
-- ADDITIVE AND IDEMPOTENT: three nullable columns, IF NOT EXISTS. Nothing is
-- dropped or rewritten; a re-run is a no-op. The removed form fields (freight
-- charges, transporter, quantity deviation, credit limit, export, grade) keep
-- their columns — saved clients keep their values.

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS business_category text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS nature_of_business text;
ALTER TABLE billing_customer_contacts ADD COLUMN IF NOT EXISTS whatsapp text;
