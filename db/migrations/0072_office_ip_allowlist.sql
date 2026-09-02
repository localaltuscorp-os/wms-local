-- 0072_office_ip_allowlist — attendance can be gated to the office Wi-Fi's
-- public IP(s). Idempotent + additive. NULL/empty = gate OFF (current behavior),
-- so deploying this does NOT lock anyone out until an admin captures the office IP.
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS office_ip_allowlist text[];
