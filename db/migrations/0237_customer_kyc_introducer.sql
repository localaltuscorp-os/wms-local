-- 0237 — Customer KYC: the Introducer box.
--
-- Manan, 2026-09-19: a new box above Documents records who introduced the
-- client — website, introducer's name, social media (Yes/No), city, email,
-- WhatsApp number, company / organisation, designation / role, nature of
-- business / work, business category, how they came to know about us
-- (Yes / No / Through WhatsApp / Friend / Colleague / Other), and the name of
-- the person who introduced them.
--
-- ONE jsonb column rather than thirteen: the fields are only ever read and
-- written together, as the client's introducer, and a new question next month
-- is then a form change, not a migration. ADDITIVE and IDEMPOTENT.

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS introducer jsonb;
