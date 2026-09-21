-- 0236 — Customer KYC: LinkedIn, Instagram, and the three payment options.
--
-- Manan, 2026-09-19: the Documents box gains a LinkedIn address and an
-- Instagram handle (alongside new Brochure and Videos uploads, which need no
-- schema — billing_customer_documents.slot is free text), and a new section
-- below it asks Subscription / EMI / Module Wise Payment, each one of
-- 'Yes' | 'No' | 'Not Applicable'.
--
-- ADDITIVE AND IDEMPOTENT: five nullable text columns, IF NOT EXISTS.

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS instagram_handle text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS subscription text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS emi text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS module_wise_payment text;
