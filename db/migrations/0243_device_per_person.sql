-- 0243 — ONE MACHINE, SEVERAL PEOPLE: a device row is one person's registration
-- of a machine, not the machine itself.
--
-- ── THE BUG THIS ENDS ──────────────────────────────────────────────────────
-- `device_id` was unique on its own (0063), so one browser could hold ONE
-- person's row. When a second person signed in on that browser, the sign-in
-- replaced the cookie with a fresh id — erasing the first person's identity —
-- and at their next sign-in the first person was a "new laptop" too. Each came
-- back pending, their one laptop slot already taken, day after day. Production
-- showed it: 17 laptop rows for one person in a fortnight, their new rows
-- alternating minute by minute with a colleague's.
--
-- Now the pair (device_id, employee_id) is unique, so each colleague on a shared
-- PC keeps their own row under the machine's one id, and nobody's cookie is
-- replaced (lib/security/device-access.ts). The machine being used by more than
-- one person becomes a recorded fact — the proxy-punching signal.
--
-- ── WHAT STAYS SINGLE-OWNER ────────────────────────────────────────────────
-- A PHONE id is the punch device: one phone presenting for two people is the
-- proxy case. So a native id (anything not minted as `web_…` by the browser
-- gate) keeps a unique index of its own, and the database still refuses a phone
-- belonging to two people even if the code forgot to.
--
-- ── THE LAPTOP NAME ────────────────────────────────────────────────────────
-- 0224 made a typed Windows device name unique across EVERYONE ("one physical
-- laptop, one registration"). A shared PC has one name, so the second colleague
-- could never register it. It is now unique per PERSON: the same person cannot
-- register the same name twice.
--
-- ── SAFE ON EXISTING DATA ──────────────────────────────────────────────────
-- Every existing row already has a globally unique device_id and a globally
-- unique laptop name, so every new, NARROWER-or-equal index builds on the data
-- as it stands. Idempotent — safe to run twice. Additive to the limits: the
-- one-laptop-one-phone cap (0215, per employee) is untouched.

-- 1 · device_id: unique per person, and still unique for phones.
DROP INDEX IF EXISTS mobile_devices_device_id_uq;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_device_employee_uq
  ON mobile_devices (device_id, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_native_device_id_uq
  ON mobile_devices (device_id)
  WHERE device_id NOT LIKE 'web\_%';

-- The gate looks a machine up by id alone to ask "is this phone someone
-- else's?"; the composite index above leads with device_id and serves that too.

-- 2 · the laptop name: unique per person.
DROP INDEX IF EXISTS mobile_devices_device_name_uq;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_device_name_employee_uq
  ON mobile_devices (employee_id, lower(device_name))
  WHERE device_name IS NOT NULL AND kind = 'laptop';
