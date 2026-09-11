# WMS Device-Lock / Device-Identification Audit

**Date:** 2026-09-11
**Scope:** Device identification, device approval and device-based access control — web/laptop first, phone secondary.
**Type:** Read-only investigation. **No code, schema, configuration, authentication behaviour or UI was changed.**

> Every conclusion below cites the file, function, route or migration that proves it. Line numbers are as of the date above.

---

## Table of contents

- [A. Current Architecture](#a-current-architecture)
- [B. Current Device-ID Mechanism](#b-current-device-id-mechanism)
- [C. Current Database Structure](#c-current-database-structure)
- [D. Current Approval Flow](#d-current-approval-flow)
- [E. Why Repeated Approval Happens](#e-why-repeated-approval-happens)
- [F. What Laptop Information Is Currently Collected](#f-what-laptop-information-is-currently-collected)
- [G. What Laptop Information Could Be Collected](#g-what-laptop-information-could-be-collected)
- [H. Phone System](#h-phone-system)
- [I. Security Weaknesses](#i-security-weaknesses)
- [J. Important Edge Cases](#j-important-edge-cases)
- [K. Exact Files / Functions Involved](#k-exact-files--functions-involved)
- [L. Recommended Direction — no implementation](#l-recommended-direction--no-implementation)
- [Appendix 1 — Environment switches](#appendix-1--environment-switches)
- [Appendix 2 — Migration history of the cap](#appendix-2--migration-history-of-the-cap)
- [Appendix 3 — Incidental findings outside the brief](#appendix-3--incidental-findings-outside-the-brief)

---

## A. Current Architecture

### A0. There is no middleware

`find . -name middleware.ts -not -path "./node_modules/*" -not -path "./.next/*"` returns **nothing**.

This matters more than it sounds. Every authentication and device decision runs inside Server Components, Server Actions and Route Handlers — there is no edge gate in front of the application. Two consequences:

- A surface that does not call `requireUser()` is **not device-checked at all**. See [I1](#i1-route-handlers-bypass-the-device-gate).
- Several code comments still refer to "the middleware" (e.g. `components/auth/login-form-canva.tsx:78`, `lib/auth/session.ts:13`). Those comments are **stale**.

### A1. The complete flow, stage by stage

| # | Stage | Where | What actually happens |
|---|-------|-------|-----------------------|
| 1 | Login (client) | `components/auth/login-form-canva.tsx:47` | Firebase `signInWithEmailAndPassword` → `cred.user.getIdToken()` → `POST /api/auth/session` |
| 2 | Authentication | `app/api/auth/session/route.ts:46` | `getFirebaseAdminAuth().verifyIdToken(idToken)` |
| 3 | Enrolment check | `app/api/auth/session/route.ts:57` | `employees` lookup by email + `isLoginLive(emp)`; 403 `not-enrolled` otherwise |
| 4 | UID reconciliation | `app/api/auth/session/route.ts:73` | Links `firebase_uid`, clears admin-reset marker, stamps `joined_at` on first sign-in |
| 5 | **Device detection + adoption** | `app/api/auth/session/route.ts:108` → `adoptDeviceOnLogin(emp)` | Reads the `att_device` cookie; reuses, enrols or refuses. **Refusal happens BEFORE the session cookie is minted** |
| 6 | Session creation | `app/api/auth/session/route.ts:124` | `setAuthCookies` mints `__session`, an **HS256 JWT signed by this app** (not a Firebase session cookie), `maxAge` 14 days |
| 7 | Device cookie set | `app/api/auth/session/route.ts:153` | `att_device` re-set on the response actually returned, because `setAuthCookies` builds its own `NextResponse` |
| 8 | **Every subsequent request** | `lib/auth/current.ts:207` `requireUser()` → `enforceWmsDeviceAccess` (React `cache()`d per request) | `resolveDeviceContext(real)`; `!allowed` → `redirect("/device-blocked")` |
| 9 | Blocked screen | `app/device-blocked/page.tsx` | Uses `requireSessionSkippingDeviceCheck()` so the page explaining the refusal is not itself refused |
| 10 | Native app requests | `lib/auth/mobile.ts:57` `authenticateMobileRequest` | Bearer ID token + `x-altus-device-id` header → same `resolveDeviceContext` |
| 11 | Web punch | `app/(app)/attendance/actions.ts:157` | A **second** `resolveDeviceContext(me)` — belt and braces |
| 12 | Attendance mutations | `lib/security/attendance-authorization.ts:90` | A **third** check, plus the laptop-only rule for editing someone else |
| 13 | Admin approval | `app/(app)/attendance/devices/page.tsx` + `actions.ts` | `requireDeviceManager()` → `device.manage` capability |
| 14 | Logout | `app/api/auth/signout/route.ts` | Revokes Firebase refresh tokens, marks `auth_sessions` revoked, clears `__session` + `ACTIVE_WORKSPACE_COOKIE`. **Does NOT clear `att_device`** |
| 15 | Session refresh | *(none)* | There is no refresh path. When `__session` expires, `readSession()` returns null → `requireSession()` redirects to `/login` |

### A2. The three enforcement points

Device authorization is asked three times on the punch path and once everywhere else:

```
requireUser()                       ← lib/auth/current.ts:207   (all pages + all server actions)
  └─ enforceWmsDeviceAccess()       ← lib/auth/current.ts:240   (cached per request)
       └─ resolveDeviceContext()    ← lib/security/device-access.ts:201

punchAction()                       ← app/(app)/attendance/actions.ts:157
  └─ resolveDeviceContext()

authorizeAttendanceMutation()       ← lib/security/attendance-authorization.ts:90
  └─ resolveDeviceContext()

authenticateMobileRequest()         ← lib/auth/mobile.ts:104
  └─ resolveDeviceContext(employee, headerDeviceId)
```

There is exactly **one** decision module: `lib/security/device-access.ts`. The older `lib/attendance/web-device.ts` is a **retired stub** whose entire body is `export {}` — kept deliberately as a signpost so nobody writes a second implementation.

### A3. Why the gate lives in `requireUser()` and not a layout

Documented in `lib/auth/current.ts:183`:

> A layout can only gate what it renders, so a layout-level check leaves every Server Action and every `POST` reachable: the page would refuse to draw the button while the action behind it still ran.

`requireUser()` is the one function both a page render and a server action must pass through. This reasoning is sound — the gap is not here, it is in the handful of surfaces that never call `requireUser()` at all ([I1](#i1-route-handlers-bypass-the-device-gate)).

### A4. Device check runs on the REAL identity, not the delegated one

`lib/auth/current.ts:224`:

```ts
const real = (await getSignedInEmployee()) ?? e;
await enforceWmsDeviceAccess(real);
```

Under temporary delegated access, the device is checked against the person actually signed in, not the account being impersonated. This is the stricter reading and is correct: a grant can never lend out the target's registered devices.

---

## B. Current Device-ID Mechanism

### B1. A laptop is identified by one thing: an httpOnly cookie

`lib/security/device-access.ts:51`:

```ts
export const DEVICE_COOKIE = "att_device";
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60;  // ten years
```

The value is minted server-side, `lib/security/device-access.ts:349` (`enroll()`):

```ts
return await enroll(employee, existingId || `web_${randomUUID()}`, kind, label);
```

So a web device id looks like `web_3f2a91c4-5b6e-4d7a-9c11-8e0f2b3d4a55` — a **random UUID v4 with a `web_` prefix**. It is derived from nothing about the machine.

### B2. Cookie attributes

`setDeviceCookie()`, `lib/security/device-access.ts:574`:

```ts
jar.set(DEVICE_COOKIE, deviceId, {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
  path: "/",
  maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
});
```

What it is **not**: not signed, not encrypted, not HMAC'd, not bound to the employee, not bound to the session, never rotated, never re-verified.

The module says so itself (`lib/security/device-access.ts:33`):

> A browser cannot offer a non-extractable hardware id, so a laptop is named by a long-lived httpOnly cookie this module mints. Weaker than the phone's keystore id: cookies can be cleared, and a determined person could copy one out of their own profile. **It is NOT a credential and is never treated as one** — it names a device, it does not authenticate a person.

### B3. Verified against every candidate signal

Nothing below is assumed; each row was checked against the code.

| Signal | Used as device identity? | Evidence |
|---|---|---|
| **Generated device ID** | **YES — the only one** | `web_${randomUUID()}`, `device-access.ts:349` |
| **Cookie** | **YES** — the transport for that id | `DEVICE_COOKIE = "att_device"`, `device-access.ts:51` |
| localStorage | **NO** | Repo-wide grep for `localStorage`: only UI preferences (`components/tasks/task-table.tsx:723`, `components/tasks/kanban-board.tsx:133`, `components/ui/reorderable-columns.tsx:28`) and the single-window guard (`components/system/single-window-guard.tsx:27`). **No device identity anywhere.** |
| sessionStorage | **NO** | Only `components/system/single-window-guard.tsx:61` (a per-tab id) and `components/onboarding/onboarding-nudge.tsx:54` (a dismissal flag) |
| Browser fingerprint | **NO** | No canvas, WebGL, font, audio or hardware probing exists in the repo |
| User agent | **Descriptive only — never identity** | `describeRequestDevice()`, `device-access.ts:601`. Derives `kind` + a label. **The raw string is not stored** |
| Browser / browser version | **NO** | Not parsed beyond the mobile/Android regex |
| OS / OS version | **NO** | Not parsed at all |
| IP address | **NO** | `getClientIp()` (`lib/attendance/office-ip.ts:21`) exists but feeds only the office-network *attendance* gate. Never persisted, never consulted for device identity |
| MAC address | **NO** | Unobtainable from a browser |
| Hardware serial / hardware info | **NO** | Unobtainable from a browser |
| Session ID | **NO** | `__session` and `att_device` are entirely independent cookies |
| Auth token | **NO** | The Firebase ID token is not part of device identity |
| Combination of the above | **NO** | The decision reads exactly one value: the cookie |

### B4. The decision function, in full

`resolveDeviceContext()`, `lib/security/device-access.ts:201`. Order of checks:

1. `exempt = !deviceRestrictionRequired(employee.email)`
2. `deviceId = deviceIdOverride ?? cookie` → `cleanDeviceId()` (trim; reject empty or `> 200` chars)
3. **No id** → exempt? allow. Enforcement off? allow. Else → `unidentified`
4. **No matching row** → exempt? allow. Enforcement off? allow. Else → `unregistered`
5. **Row belongs to another employee** → exempt? allow (without adopting). Enforcement off? allow. Else → `other_employee`
6. **`status === "approved"`** → **allow**, returning the row and its `kind`
7. Otherwise → exempt? allow. Enforcement off? allow. Else → `revoked` or `pending`

Note step 6 is the only path that returns the device row for a non-exempt actor. `kind` from that row is what the laptop-only rule in `attendance-authorization.ts:110` reads.

### B5. `kind` is derived from the user agent, server-side

`describeRequestDevice()`, `lib/security/device-access.ts:601`:

```ts
const ua = (await headers()).get("user-agent") ?? "";
const isAndroid = /android/i.test(ua);
const isMobile = isAndroid || /iphone|ipad|ipod|mobile|webos|blackberry|windows phone/i.test(ua);
return {
  kind: isMobile ? "phone" : "laptop",
  label: isAndroid ? "Web (Android)" : isMobile ? "Web (Mobile)" : "Web (Desktop)",
};
```

This decides **which of the person's two slots the device occupies** — not whether it is allowed. It is nevertheless load-bearing, and it is a direct cause of repeated approvals ([E2, Bug 2](#bug-2--an-android-browser-and-the-android-app-fight-over-one-slot)).

---

## C. Current Database Structure

### C1. One table: `mobile_devices`

Defined at `db/schema.ts:2030`. The name is historical — it was originally the phone allowlist (migration 0063) and now holds laptops too.

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | **PRIMARY KEY**, `defaultRandom()` | |
| `employee_id` | `uuid` | **FK → `employees.id`**, `ON DELETE CASCADE` | The user↔device link |
| `device_id` | `text` | **NOT NULL, globally UNIQUE** (`mobile_devices_device_id_uq`) | `web_<uuid>` for browsers; 32-hex keystore HMAC for phones |
| `kind` | `text` | `NOT NULL DEFAULT 'phone'`, CHECK `in ('laptop','phone')` | `mobile_devices_kind_chk` |
| `label` | `text` | | `"Web (Desktop)"`, `"Pixel 8"`, `"… (auto-registered)"` |
| `platform` | `text` | | `"web"` / `"android"` / `"admin"` |
| `status` | `text` | `NOT NULL DEFAULT 'approved'` | `approved` \| `pending` \| `revoked`. **No CHECK constraint, not a DB enum** |
| `approved_by_id` | `uuid` | FK → `employees.id`, `ON DELETE SET NULL` | |
| `approved_at` | `timestamptz` | | |
| `revoked_by_id` | `uuid` | FK → `employees.id`, `ON DELETE SET NULL` | Added 0215 |
| `revoked_at` | `timestamptz` | | |
| `revoke_reason` | `text` | | Added 0215 |
| `registered_by_id` | `uuid` | FK → `employees.id`, `ON DELETE SET NULL` | NULL = self-service; set = an admin enrolled it |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `last_used_at` | `timestamptz` | | Stamped by the **punch** path |
| `last_seen_at` | `timestamptz` | | Stamped by **any WMS page load** (added 0215) |

### C2. Indexes and the cap

```
mobile_devices_device_id_uq             UNIQUE (device_id)
mobile_devices_employee_idx                    (employee_id)
mobile_devices_kind_idx                        (kind)
mobile_devices_employee_status_idx             (employee_id, status)
mobile_devices_employee_kind_approved_uq UNIQUE (employee_id, kind) WHERE status = 'approved'
mobile_devices_cap_approved_trg          TRIGGER BEFORE INSERT OR UPDATE
```

The trigger (`db/migrations/0215_device_access_and_attendance_audit.sql:88`) takes `pg_advisory_xact_lock(hashtext('mobile_devices_cap:' || employee_id || ':' || kind))` before counting, which is what makes it a guarantee rather than a check — two concurrent approvals cannot both read "none approved" and both write.

The migration's own note on why both exist:

> With the cap back to one per kind the cardinality IS expressible as a partial unique index again — and an index is a stronger guarantee than a trigger, because a session can disable triggers and cannot disable an index. Belt and braces: the trigger raises the readable error, the index makes the rule true.

### C3. Direct answers to the brief's questions

**How are users linked to devices?**
`mobile_devices.employee_id` → `employees.id`, cascade delete. `device_id` is globally unique, so a device row can belong to exactly one employee — a phone or a browser cannot be shared across people.

**Can multiple devices exist for one employee?**
**Yes — unlimited rows, but at most ONE `approved` per `kind`.** So the practical answer is **two usable devices: one laptop + one phone**. Pending and revoked rows accumulate without limit, on purpose (`0215:96`): *"a replacement must be registerable while the device it succeeds is still approved."*

**How is approval status stored?**
The `status` text column. `approved` = usable; `pending` = registered, awaiting an administrator; `revoked` = withdrawn.

**How are revoked/old devices handled?**
**Never deleted.** `setDeviceStatus()` (`lib/attendance/mobile-devices.ts:414`) updates `status`, `revoked_at`, `revoked_by_id`, `revoke_reason` and leaves the row in place. `listAllDevices()` (`mobile-devices.ts:317`) deliberately includes them:

> INCLUDES REVOKED ROWS, on purpose: they are the device history the audit requirement asks for, and a list that hid them would make a withdrawn device indistinguishable from one that never existed.

On **re-approval**, the revocation record is cleared (`revoked_at`, `revoked_by_id`, `revoke_reason` all set to null) so an approved row does not read as withdrawn.

**Is there a concept of primary/active device?**
**No.** There is no `is_primary`, no `is_active`, no ordering column. "Active" is `status = 'approved'`, and singularity comes entirely from the partial unique index on `(employee_id, kind)`. Any notion of a primary device would have to be added.

### C4. Related tables that are NOT the device lock

| Table | What it actually is |
|---|---|
| `device_push_tokens` (`db/schema.ts:5827`) | Web-push subscription tokens. Unrelated to access control |
| `webauthn_credentials` (`db/schema.ts:2359`) | Platform passkeys for the **biometric punch**. Carries `device_label`, `credential_id`, `public_key`, `counter`, `transports`. Relevant to [L7](#l-recommended-direction--no-implementation) |
| `auth_sessions` (`db/schema.ts:371`) | Session tracking — **and it is dead**. See [Appendix 3](#appendix-3--incidental-findings-outside-the-brief) |
| `attendance_audit_log` (`db/schema.ts:2133`) | Records `device_row_id`, `device_label`, `device_kind` alongside privileged attendance changes |

---

## D. Current Approval Flow

### D1. Web laptop — first sign-in

`adoptDeviceOnLogin()`, `lib/security/device-access.ts:306`:

1. Read `att_device`; derive `kind` + `label` from the UA
2. If the actor is **exempt** or enforcement is **off** → `resolveWithoutRefusing()` (never refuses; see [J5](#j-important-edge-cases))
3. If a cookie exists and names a row:
   - **belongs to someone else** → mint a **brand-new** `web_<uuid>` and enrol it
   - **approved and theirs** → `touchLastSeen()`, sign in, `adopted: false`
   - **pending / revoked** → refuse with that reason
4. If a cookie exists but names no row (revoked-and-purged, restored DB) → fall through to enrolment
5. Otherwise → `enroll(employee, existingId || web_<uuid>, kind, label)`

`enroll()` (`device-access.ts:452`):

```ts
const slotFree = deviceAutoAdoptEnabled() && !(await hasApprovedDeviceOfKind(employee.id, kind));
await db.insert(mobileDevices).values({
  employeeId: employee.id, deviceId, kind,
  label: slotFree ? `${label} (auto-registered)` : label,
  platform: "web",
  status: slotFree ? "approved" : "pending",
  approvedAt: slotFree ? new Date() : null,
  lastSeenAt: new Date(),
});
```

**The cookie is set either way** — pending included. Without that, the person would mint a fresh pending row on every sign-in attempt and the approval queue would fill with duplicates of one laptop.

If the row lands `pending`, `alertManagersPending()` (`device-access.ts:503`) fires — dynamically imported so the notification stack stays off `requireUser()`'s module graph, and **awaited** rather than fire-and-forget because on serverless an un-awaited promise can be killed when the response returns, and this is precisely the case where the alert is the thing that unlocks the person.

### D2. The refusal is returned before a session exists

`app/api/auth/session/route.ts:108`:

```ts
const device = await adoptDeviceOnLogin(emp);
if (!device.ok) {
  return NextResponse.json(
    { error: "device-not-authorized", deviceStatus: device.reason, message: device.error },
    { status: 403 },
  );
}
```

Deliberate, per the comment above it: issuing a session and then blocking every page would leave someone signed in to an application they cannot use, and would hand an unregistered device a valid session cookie.

The client shows the server's own sentence verbatim via a dedicated `DeviceNotAuthorizedError` class (`components/auth/login-form-canva.tsx:43`) rather than string-matching, so "never registered" / "waiting for approval" / "revoked" stay distinguishable.

### D3. Phone — no approval step at all

`registerMobileDevice()`, `lib/attendance/mobile-devices.ts:145`. Admin approval was **removed 2026-09-09**. The insert writes `status: "approved"` directly when the phone slot is free; when it is not, it returns an **error** (not a pending row):

> You already have an approved phone. Ask a device administrator to revoke it before registering another.

Administrators keep visibility (`alertAdminsNewAttendanceDevice`) and the power to revoke, but lose the veto.

Legacy `pending` rows from before that change are **healed in place** on first use by `resolveMobileDevice()` (`mobile-devices.ts:115`) — otherwise everyone left in the old queue would stay locked out with no approver.

**Note the asymmetry:** the web gate does **not** heal pending rows. A web `pending` stays pending until a human acts.

### D4. Who may approve

`lib/security/capabilities.ts:91` — the `GRANTS` table, keyed on lowercase `employees.email`:

| Email | `device.manage` | `device.exempt_from_restriction` |
|---|---|---|
| `manan@unleashed.in` | ✅ | ✅ **(the only exemption)** |
| `ruchitaambre.altuscorp@gmail.com` | ✅ | ❌ |
| `rutvishamehta.altuscorp@gmail.com` | ✅ | ❌ |
| `rohanchoudhary.altuscorp@gmail.com` | ❌ | ❌ |

Enforced by `requireDeviceManager()` (`lib/auth/current.ts:332`) on the page and on every action in `app/(app)/attendance/devices/actions.ts`.

`deviceRestrictionRequired()` (`capabilities.ts:181`) is phrased positively so an **unknown address defaults to restricted** — a typo in the grants table fails closed.

### D5. Admin surfaces

| Action | Function | Cap check used |
|---|---|---|
| Approve a pending device | `approveDevice()` → `setDeviceStatus(id, "approved", me.id)` | **Across kinds — BUG.** See [E2](#bug-1--the-approve-button-is-broken-for-anyone-who-already-has-a-phone) |
| Revoke | `revokeDevice()` → `setDeviceStatus(id, "revoked", me.id, reason)` | n/a |
| Register on someone's behalf | `registerDeviceForEmployee()` → `adminRegisterDevice()` | **Per kind — correct** (`hasApprovedOfKind`) |

All three write an `employee_events` row via `auditDeviceChange()` (`devices/actions.ts:117`), filed against the device's **owner**, not the administrator. Best-effort — a failed audit write never rolls back the change.

`setOfficeIpAllowlist()` in the same file deliberately stays on `requireAttendanceAdmin()`, not `requireDeviceManager()` — it is an attendance setting that happens to share the screen.

---

## E. Why Repeated Approval Happens

### E1. What does and does not change the device ID

The cookie is `httpOnly` with a **ten-year** `maxAge`, and logout does not clear it. That makes it far more durable than people expect.

| Scenario | New device ID? | Why |
|---|---|---|
| Browser closed and reopened | **NO** | Persistent cookie, 10-year expiry |
| User logs out and logs back in | **NO** | `app/api/auth/signout/route.ts` clears `__session` and `ACTIVE_WORKSPACE_COOKIE` **only**. `att_device` is untouched |
| Session expires (14 days) | **NO** | `__session` and `att_device` have independent lifetimes |
| Browser restarted | **NO** | |
| Computer restarted | **NO** | |
| Cookies remain | **NO** | This is the happy path |
| localStorage remains | **NO** | localStorage plays no part in device identity |
| localStorage cleared | **NO** | Same |
| Browser updates | **NO** (normally) | The profile survives an update. A *reinstall* that discards the profile does not |
| IP / network changes | **NO** | IP is not part of the identity at all |
| **Cookies cleared / "clear site data"** | **YES** | The only copy of the identity is gone. `enroll()` mints a fresh UUID → `pending` once the slot is filled |
| **Another browser** (Chrome → Edge → Firefox) | **YES** | Separate cookie jars. Each browser is a separate "device" by construction |
| **Incognito / private mode** | **YES, every single time** | Ephemeral jar discarded on close. Every private session is a brand-new device |
| Different OS user account / browser profile | **YES** | Separate cookie jar |
| Browser set to "clear cookies on exit" | **YES, every launch** | Same as clearing cookies |
| Site accessed over plain HTTP in production | **YES (effectively)** | `secure: true` means the cookie is neither sent nor set |

The module is explicit that clearing cookies is not a way to get a fresh free slot (`device-access.ts:128`):

> Clearing cookies after that point does NOT hand out a fresh device — it produces a pending registration, the same answer a colleague's browser gets.

So legitimate re-approval after a cache clear is **by design**. The cases below are not.

### E2. Three structural bugs that manufacture repeat approvals

#### Bug 1 — the Approve button is broken for anyone who already has a phone

`setDeviceStatus()`, `lib/attendance/mobile-devices.ts:379`:

```ts
const [c] = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(mobileDevices)
  .where(
    and(
      eq(mobileDevices.employeeId, row.employeeId),
      eq(mobileDevices.status, "approved"),
      // ← MISSING: eq(mobileDevices.kind, row.kind)
    ),
  );
if ((c?.n ?? 0) >= MAX_APPROVED_PER_KIND && row.status !== "approved") {
  return { ok: false, error: `This employee already has an approved ${DEVICE_KIND_LABELS[row.kind].toLowerCase()}. Revoke it first.` };
}
```

`MAX_APPROVED_PER_KIND = 1` (`mobile-devices.ts:35`). The count is taken **across all kinds** and compared against the **per-kind** limit — directly contradicting the comment three lines above it, which claims *"Counted PER KIND (0215) so the check matches the trigger and the unique index."*

**Effect:** an employee holding one approved phone and one pending laptop **cannot have that laptop approved**. The administrator sees the misleading message *"This employee already has an approved laptop. Revoke it first."* even though the laptop slot is empty.

This is application-level only. The database would permit the write — `mobile_devices_employee_kind_approved_uq` and `mobile_devices_cap_approved_trg` are both correctly scoped to `(employee_id, kind)`.

**Why it produces repeated approvals:** the obvious remedy for an administrator facing that message is to revoke the phone, approve the laptop, and then re-register the phone — which then needs approving again. A revoke/approve loop, exactly matching the reported symptom.

A working path does exist: the "Register device for employee" form calls `adminRegisterDevice()` (`mobile-devices.ts:459`), which uses `hasApprovedOfKind(employeeId, kind)` **correctly**. But it requires the admin to type the device id by hand, and for a laptop that id is a server-minted UUID inside an httpOnly cookie the employee **cannot read**. So in practice the working path is unusable for laptops.

> This is the single most likely root cause of the reported problem.

#### Bug 2 — an Android browser and the Android app fight over one slot

`describeRequestDevice()` (`device-access.ts:601`) classifies **any** UA matching `/android|iphone|ipad|ipod|mobile|webos|blackberry|windows phone/i` as `kind: "phone"`. The native Android app also enrols as `kind: "phone"` (`registerMobileDevice()` defaults to `phone`).

Since the cap is **one approved phone**, an employee who uses both the app and a mobile browser has two clients competing for one slot. Whichever arrives second is permanently stuck — `pending` forever (web) or a hard error (app). Nothing in the system resolves it; an administrator approving one necessarily displaces the other.

The same misclassification catches:
- an **Android tablet** or **iPad** (treated as a phone, not a laptop)
- a desktop Chrome window left in **device-emulation mode** (silently becomes a "phone")
- any laptop whose UA happens to contain the substring `mobile`

#### Bug 3 — a shared browser profile rotates the cookie on every swap

`adoptDeviceOnLogin()`, `device-access.ts:333`:

```ts
if (row.employeeId !== employee.id) {
  // Two people sharing one browser profile...
  return await enroll(employee, `web_${randomUUID()}`, kind, label);
}
```

Person A signs in (cookie → A's id). Person B signs in on the same profile → the cookie names A's row → B gets a **brand-new** UUID, and the cookie now holds B's id. When A returns, the cookie names B's row → **A gets another brand-new UUID**, orphaning A's original row.

Each alternation creates a fresh `pending` row for whoever is arriving. The approval queue fills with duplicates of one physical machine — and because the laptop slot is already occupied by the first orphaned row, **none of them can be approved** without a revocation first.

### E3. Administrator lock-out / deadlock risk

`requireDeviceManager()` (`current.ts:332`) calls `requireUser()`, which enforces the device check. So a device administrator whose laptop is unrecognised **cannot reach the screen that would approve it**.

Today this is masked by two things: `DEVICE_AUTO_ADOPT` defaults to on, and Manan holds the exemption. But `.env.example:248` ships `DEVICE_AUTO_ADOPT=""`, and the intended endgame is to set it to `off` once the roster has enrolled (`device-access.ts:136`). At that point **Ruchita and Rutvisha are one cache-clear away from being locked out with no self-rescue path**, leaving a single exempt account as the only way back in.

### E4. Summary of causes, ranked

| Rank | Cause | Class |
|---|---|---|
| 1 | `setDeviceStatus` counts across kinds — approval refused when the slot is free | **Bug** |
| 2 | Android browser vs Android app contend for the single `phone` slot | **Design gap** |
| 3 | Shared browser profile mints a new UUID on every swap | **Design gap** |
| 4 | Clearing cookies / site data | **By design** (but the only recovery is an administrator) |
| 5 | Incognito, a second browser, a second OS profile | **By design** |
| 6 | Admin deadlock once auto-adopt closes | **Latent** |

---

## F. What Laptop Information Is Currently Collected

Classification as requested: **Currently collected** / **Available but not collected** / **Not reliably available from a normal browser**.

| Item | Classification | Evidence |
|---|---|---|
| **Browser** | **Available but not collected** | Server has the `user-agent` header; only the mobile regex is applied |
| **Browser version** | **Available but not collected** | Same |
| **OS** | **Available but not collected** | Same. Also `Sec-CH-UA-Platform` is available on Chromium |
| **OS version** | **Available but not collected** | Needs `Accept-CH: Sec-CH-UA-Platform-Version`; not requested anywhere |
| **User agent (raw)** | **Available but DELIBERATELY not collected** | `db/migrations/0215:44` — *"DELIBERATELY NOT STORED: IP addresses, full user-agent strings, screen fingerprints, canvas/font hashes."* Reinforced at `device-access.ts:596` |
| **Platform** | **Partially collected** | `mobile_devices.platform` stores the literal `"web"` / `"android"` / `"admin"` — a client discriminator, **not** the OS |
| **Device name** | **Not collected (web).** Collected on phones | `DeviceId.kt:44` sends `Build.MANUFACTURER + Build.MODEL` (e.g. `"Pixel 8"`) |
| **Laptop manufacturer** | **Not reliably available** | No browser API exposes it. (`Sec-CH-UA-Model` is Android-only and empty on desktop) |
| **Laptop model** | **Not reliably available** | Same |
| **Hardware serial number** | **Not available** | No browser API exposes it, by design |
| **Screen information** | **Available but not collected** | `screen.width/height/colorDepth`, `devicePixelRatio` — client-side only, not read anywhere |
| **Timezone** | **Available but not collected for devices** | `Intl.DateTimeFormat().resolvedOptions().timeZone` is unused. `employees.timezone` exists but is an attendance/payroll setting |
| **Language** | **Available but not collected** | `Accept-Language` header / `navigator.language` — unused |
| **IP address** | **Read, never stored, never used for device identity** | `getClientIp()` (`lib/attendance/office-ip.ts:21`) reads `x-forwarded-for` / `x-real-ip` purely for the office-network punch gate. `auth_sessions.ip_hash` exists but is **never written** |
| **Fingerprint information** | **Available but deliberately not collected** | No canvas/WebGL/font/audio probing exists |
| **Device kind (laptop/phone)** | **CURRENTLY COLLECTED** | Derived from UA, `device-access.ts:601`; stored in `mobile_devices.kind` |
| **Human label** | **CURRENTLY COLLECTED** | `"Web (Desktop)"` / `"Web (Mobile)"` / `"Web (Android)"`, `+ " (auto-registered)"` when auto-adopted |
| **Generated device id** | **CURRENTLY COLLECTED** | `web_<uuid>` in `mobile_devices.device_id` |
| **Timestamps** | **CURRENTLY COLLECTED** | `created_at`, `approved_at`, `revoked_at`, `last_used_at`, `last_seen_at` |
| **Actors** | **CURRENTLY COLLECTED** | `approved_by_id`, `revoked_by_id`, `registered_by_id`, `revoke_reason` |

**In one sentence:** for a laptop, WMS stores a random UUID, a coarse kind, a five-word label, the string `"web"`, some timestamps and some actor ids. Nothing else.

The minimalism is a **documented privacy decision**, not an oversight (`0215:44`):

> None of them is needed to answer "may this device use the WMS" — the device id answers that — and each one is a lasting record of where an employee physically was and what they run. The columns kept (kind, label, platform) are what a person needs to recognise their own device on the approval screen, and nothing more.

---

## G. What Laptop Information Could Be Collected

For completeness, and to inform [L](#l-recommended-direction--no-implementation). **Nothing here is implemented.**

### G1. Available server-side today, with no client change

| Signal | Source | Stability | Spoofable? |
|---|---|---|---|
| Full user-agent string | `user-agent` header | Changes on every browser update | Trivially |
| `Sec-CH-UA` (brand + major version) | Chromium, sent by default | Changes on major updates | Trivially |
| `Sec-CH-UA-Mobile` | Chromium, default | Stable | Trivially |
| `Sec-CH-UA-Platform` | Chromium, default | Stable per machine | Trivially |
| `Accept-Language` | Default | Stable | Trivially |
| Client IP | `x-forwarded-for` | Changes with network | Via VPN/proxy |

### G2. Available with an `Accept-CH` opt-in header (high-entropy client hints)

`Sec-CH-UA-Platform-Version`, `Sec-CH-UA-Arch`, `Sec-CH-UA-Bitness`, `Sec-CH-UA-Full-Version-List`, `Sec-CH-UA-Model` (**Android only** — always empty on desktop).

### G3. Available client-side only (would need JS + a POST)

Screen metrics, `devicePixelRatio`, timezone, `navigator.language(s)`, `hardwareConcurrency`, `deviceMemory`, installed-font enumeration, canvas / WebGL / audio fingerprints, `navigator.storage.estimate()`.

**All of the above are spoofable, drift across browser updates, and are shared across many identical corporate laptops.** A fingerprint built from them produces both false positives (two identical Dell laptops in the same build) and false negatives (one Chrome update), which is the worst combination for an access-control decision.

### G4. The one genuinely hardware-bound option a browser offers

**WebAuthn platform authenticators** — TPM 2.0 on Windows, Secure Enclave on macOS, StrongBox on Android. The private key is non-extractable, survives cookie clearing, and cannot be copied to another machine.

**This is already in the codebase**, used for the biometric punch:
- `db/schema.ts:2359` — `webauthn_credentials` (`credential_id`, `public_key`, `counter`, `transports`, **`device_label`**)
- `lib/webauthn/attendance.ts` — `@simplewebauthn/server`, registration + authentication options, challenge in a short-lived httpOnly cookie (`att_wa_chal`), 15-minute TTL

It is the only browser mechanism that would give web parity with the phone's keystore id.

### G5. Not reliably available from any normal browser

MAC address · hardware serial number · laptop manufacturer · laptop model (except Android) · BIOS/UEFI ids · disk serial · Windows/macOS machine name · domain-join status.

Obtaining any of these requires a native agent, a managed-browser policy (Chrome Enterprise `DeviceSerialNumber` via the Enterprise API), or an MDM integration — all of them outside what a web page can do.

---

## H. Phone System

| Question | Answer |
|---|---|
| **How are phone devices identified?** | A **32-hex-char HMAC-SHA256** over the fixed label `"com.altuscorp.altus.device"`, computed with a **non-extractable Android Keystore key** (alias `altus_device_identity`). `android-app/.../core/util/DeviceId.kt:66` |
| **Where is the id stored?** | On the phone: the key lives in secure hardware and never leaves it. On the server: the same `mobile_devices.device_id` column, `kind='phone'`, `platform='android'` |
| **Fallback** | If the keystore is unavailable (rare OEM breakage), a random UUID persisted in app-private SharedPreferences — weaker binding, same contract. `DeviceId.kt:85` |
| **How is it transported?** | The `x-altus-device-id` header, read by `deviceIdFromRequest()` (`device-access.ts:633`) and validated in `authenticateMobileRequest()` (`lib/auth/mobile.ts:83`) |
| **How does approval work?** | **It does not.** Admin approval was removed 2026-09-09. `registerMobileDevice()` (`mobile-devices.ts:195`) inserts `status: "approved"` directly if the slot is free; otherwise it returns an error. Admins are notified and may revoke, but have no veto |
| **How many phones?** | **One approved phone** (`MAX_APPROVED_PER_KIND = 1`, `mobile-devices.ts:35`) |
| **Same mechanism as web?** | **Same table, same lifecycle, same gate, same cap — different identity source.** Cookie (clearable, copyable, server-minted) vs keystore HMAC (hardware-bound, non-extractable) |
| **What resets a phone id?** | Uninstall or "clear data" — the app's equivalent of clearing cookies. Documented at `DeviceId.kt:29` |
| **Registration endpoint** | `POST /api/mobile/attendance/register-device` — **the only endpoint in the app with `skipDeviceCheck: true`**, because enrolling a phone that is by definition not yet registered cannot itself require a registered phone |

### H1. The mobile rollout grace

`mobileHeaderGraceActive()` (`device-access.ts:175`) reads `DEVICE_ACCESS_MOBILE_GRACE_UNTIL`, a **date**, not a boolean:

- It applies to exactly one case: a native request presenting **no** device id (the old-build signature)
- A request that **does** name a device gets the full check throughout the grace — revoked stays revoked, pending stays pending, another employee's phone is still refused
- An **unparseable** date is treated as **no grace**, with a `console.warn` — fails closed
- Unset (the default) means no grace

The reasoning for a deadline over a flag is worth preserving (`device-access.ts:147`): *"a boolean has no reason to ever become true again… the failure is silent: the control is simply off, forever, and nothing says so."*

### H2. The punch-time phone gate is separate and weaker in one respect

`resolveMobileDevice()` (`mobile-devices.ts:79`) **heals legacy `pending` rows to `approved` in place** on first use. The web gate does not. A web device that lands pending stays pending.

---

## I. Security Weaknesses

### Bypass matrix

| Attack | Works? | Why |
|---|---|---|
| Changing **localStorage** | **NO** | Not used for identity anywhere |
| Manipulating **frontend state** | **NO** | Every check is server-side. `requireUser()` gates page renders *and* server action bodies — an unauthorized device gets the redirect before the action body runs |
| Calling **APIs directly** | **PARTIALLY** — see [I1](#i1-route-handlers-bypass-the-device-gate) | Most surfaces funnel through `requireUser()`; five do not |
| Changing **browser information** | **NO for access; YES for slot assignment** | A spoofed mobile UA makes a laptop compete for the phone slot. It does not grant access |
| Changing **IP / network** | **NO** | IP is not part of device identity |
| Using **another browser** | **NO** | Lands `pending` once the kind's slot is filled; refused at sign-in |
| **Changing cookies** | **YES — the central weakness** | See [I2](#i2-the-cookie-is-an-unsigned-bearer-identifier) |
| **Reusing another session/token** | **YES, partially** | See [I3](#i3-no-sessiondevice-binding) |

### I1. Route handlers bypass the device gate

These surfaces resolve the user with `getCurrentEmployee()` and **never call `requireUser()`**, so `enforceWmsDeviceAccess` never runs:

| Surface | Line | What it exposes |
|---|---|---|
| `app/(app)/my-salary/actions.ts` | `:36` `fetchMonthLedger` | **Salary ledgers** — an unregistered device with a valid session can read them |
| `app/(app)/agreements/pdf/[id]/route.ts` | `:44` | Agreement PDFs |
| `app/(app)/ws/[id]/route.ts` | `:38` | Workspace switch |
| `app/api/google/connect/route.ts` | `:15` | Google OAuth initiation |
| `app/api/google/callback/route.ts` | — | Google OAuth callback |

Each still checks authentication and candidate status, and `fetchMonthLedger` checks `canViewSalaryOf`. So this is a **device**-control gap, not an authentication gap. But it means the accurate claim is *"an unregistered laptop cannot use the WMS **UI**"*, not *"cannot use the WMS"*.

By contrast, `app/master-admin/actions.ts:55` and `app/(admin)/admin/temporary-access/actions.ts:87` **do** call `requireUser()` explicitly before using `getSignedInEmployee()` — the correct pattern, and evidence that the gap above is an oversight rather than a policy.

### I2. The cookie is an unsigned bearer identifier

`att_device` carries a raw UUID with no signature and no binding to the employee. Consequences:

- Anyone who can read the cookie on **their own machine** (devtools, a profile backup, malware, a support session) can paste it into another browser or a `curl` call, and that machine becomes the approved device.
- `httpOnly` stops **JavaScript** from reading it — it does not stop the user, devtools, or any process with filesystem access to the browser profile.
- There is no way to detect that a cookie has been copied, because nothing else about the request has to match.

The module states this openly (`device-access.ts:33`) and argues the property actually bought is a different one: *"you cannot use the WMS from a colleague's laptop, because their browser carries their cookie and a cookie already bound to another employee is refused outright."* That much is true and holds.

### I3. No session↔device binding

`__session` and `att_device` are independent. The gate verifies:

- session → employee (Firebase JWT)
- device → employee (`mobile_devices.employee_id`)

It never verifies **session → device**. So a stolen or exported `__session` cookie replayed from an attacker's **own approved** device passes every check: the session says "Rutvisha", the device says "attacker's approved laptop, owned by attacker"… and `resolveDeviceContext` is called with `employee = Rutvisha`, finds the attacker's row, sees `row.employeeId !== employee.id` → `other_employee` → **refused**.

So the naive replay is blocked. The real exposure is narrower but real: an attacker who holds **both** a victim's session cookie **and** the victim's device cookie (both extractable from one compromised browser profile) reconstitutes the full identity on any machine. Binding the device id into the session JWT would not prevent that either, but it would make the pair tamper-evident and would close the case where only one of the two is stolen.

### I4. Auto-adopt is open by default

`deviceAutoAdoptEnabled()` returns true unless `DEVICE_AUTO_ADOPT === "off"`, and `.env.example:248` ships it empty. The module names this itself (`device-access.ts:136`):

> **THIS IS THE ONE REAL WEAKNESS IN THE ROLLOUT** and it should be closed deliberately: someone who has an employee's password and signs in before the employee does takes the slot.

The Registered Devices screen surfaces the state as a badge (`devices/page.tsx:97`), so it is visible rather than buried — good practice.

### I5. Login fails open on infrastructure error

`app/api/auth/session/route.ts:116`:

```ts
} catch (err) {
  console.error("device adoption failed — allowing sign-in", err);
}
```

If the device lookup **throws** (database unreachable), sign-in proceeds and **no device cookie is set**. A deliberate availability trade — a DB hiccup must not lock the whole company out — but it means a database outage disables the control entirely. Note that a device successfully checked and *refused* is still refused; only a thrown error fails open.

### I6. `status` is an unconstrained text column

`status text NOT NULL DEFAULT 'approved'` with **no CHECK constraint** and no DB enum. A typo or a bad migration writes a value that is neither `approved`, `pending` nor `revoked`.

`resolveDeviceContext` treats anything non-`approved` as `pending` (`device-access.ts:253`), so it **fails closed** — but the data can silently drift, and `getDeviceStatusFor()` (`mobile-devices.ts:283`) maps anything non-`revoked` to `"approved"`, which fails **open** on the mobile status endpoint. The two disagree.

### I7. Three development bypasses

`enforceWmsDeviceAccess` returns immediately under `DUMMY_MODE`, `devAuthBypassEnabled()` or `localSessionEnabled()` (`current.ts:246`). All three are hard-disabled under `NODE_ENV=production` (`lib/db/dummy-dir.ts`, `lib/auth/dev-bypass.ts`, `lib/auth/local-session.ts`), so no deployment can take these branches. Documented and acceptable.

### I8. No rotation, no re-verification, no expiry in practice

The ten-year cookie is minted once and never re-proved. There is no periodic re-attestation, no rotation on privilege change, and no way to invalidate a specific cookie other than revoking the whole device row.

---

## J. Important Edge Cases

1. **`att_device` is not cleared at logout.** Correct for usability (nobody re-enrols after signing out), but on a shared or kiosk machine one person's device identity persists until someone else's login rotates it — and that rotation is [Bug 3](#bug-3--a-shared-browser-profile-rotates-the-cookie-on-every-swap).

2. **The web gate does not heal `pending` rows; the mobile punch path does.** `resolveMobileDevice()` (`mobile-devices.ts:115`) promotes a legacy pending row on first use. `resolveDeviceContext()` never does. A web pending row waits for a human indefinitely.

3. **A cookie naming a deleted row falls through to enrolment** rather than erroring (`device-access.ts:344`) — covers a restored database or a purged row.

4. **Delegated access checks the real signed-in employee's device**, not the impersonated one (`current.ts:224`). Rudra stays confined to Rudra's own approved devices for the whole delegated session; a grant can never lend out Rutvisha's registered devices.

5. **An exempt actor on a colleague's browser gets a fresh identity**, never the colleague's row (`resolveWithoutRefusing()`, `device-access.ts:392`) — so an exempt actor is never recorded as somebody else's device. When both slots are full they simply carry a stable cookie with no row at all, and `resolveDeviceContext` reports them as exempt on every request.

6. **An exempt actor is exempt at the door, not only after it** (`device-access.ts:312`). This was a real bug: an exempt super-admin whose laptop slot was already full got "waiting for approval" at the login form and never reached the application — the precise opposite of the exemption's purpose.

7. **`secure: true` in production** means the cookie is neither sent nor set over plain HTTP. Any deployment reachable over HTTP re-enrols on every request.

8. **Browsers configured to "clear cookies on exit"** re-trigger enrolment at every launch and will accumulate one orphaned pending row per launch.

9. **The `approveDevice` cap check and the DB constraint disagree** ([Bug 1](#bug-1--the-approve-button-is-broken-for-anyone-who-already-has-a-phone)). The database is more permissive than the application.

10. **`registerDeviceForEmployee` is unusable for laptops in practice** — it requires typing a device id the employee cannot see, because the laptop id lives only inside an `httpOnly` cookie. It works for phones, where the app displays the id.

11. **Two concurrent sign-ins from the same new browser** are handled: whoever loses the insert reads the winner's row (`enroll()`'s catch, `device-access.ts:470`), and a race on the approved-per-kind unique index degrades to `pending`, which is the correct answer rather than an error.

12. **`cleanDeviceId` rejects ids over 200 characters** (`device-access.ts:589`) and treats them as absent — so an oversized cookie reads as `unidentified`, not as an error.

---

## K. Exact Files / Functions Involved

### Core device logic

**`lib/security/device-access.ts`** — the single decision module
- `DEVICE_COOKIE` (`"att_device"`), `DEVICE_COOKIE_MAX_AGE_SECONDS` (10y), `DEVICE_ID_HEADER` (`"x-altus-device-id"`)
- `deviceAccessEnforced()` · `deviceAutoAdoptEnabled()` · `mobileHeaderGraceActive()`
- `resolveDeviceContext()` — read-only, safe in Server Components
- `adoptDeviceOnLogin()` — the **only** function that mints a cookie; Route Handlers / Server Actions only
- `resolveWithoutRefusing()` · `deviceBelongsToAnotherEmployee()` · `enroll()` · `alertManagersPending()`
- `hasApprovedDeviceOfKind()` · `readDeviceCookie()` · `setDeviceCookie()` · `describeRequestDevice()` · `cleanDeviceId()` · `touchLastSeen()` · `deviceIdFromRequest()` · `unenforced()`

**`lib/attendance/mobile-devices.ts`** — table access + admin surface
- `MAX_APPROVED_PER_KIND` (1) · `MAX_DEVICES_PER_EMPLOYEE` (derived, 2)
- `resolveMobileDevice()` — punch-time gate, heals legacy pending
- `registerMobileDevice()` — the app's self-registration
- `hasApprovedOfKind()` · `activeCount()` · `countMobileDevices()` · `getDeviceStatusFor()`
- `listAllDevices()` · `setDeviceStatus()` ← **contains Bug 1** · `adminRegisterDevice()`

**`lib/security/capabilities.ts`** — who is exempt, who may approve
- `GRANTS` · `hasCapability()` · `emailsWithCapability()` · `deviceRestrictionRequired()` · `canManageDevices()`

**`lib/attendance/web-device.ts`** — retired stub (`export {}`), kept as a signpost

### Authentication

**`lib/auth/current.ts`**
- `getSignedInEmployee()` · `getCurrentEmployee()` · `requireSession()` (**no device check**)
- `requireSessionSkippingDeviceCheck()` — for `/device-blocked` only
- `requireUser()` → `enforceWmsDeviceAccess` (cached) — **the choke point**
- `requireDeviceManager()` · `requireAdmin()` · `requireSuperAdmin()` · `isLoginLive()` · `isCandidateAccount()`

**`lib/auth/mobile.ts`** — `authenticateMobileRequest()`, `MobileAuthOptions.skipDeviceCheck`, `MOBILE_CORS`
**`lib/auth/session.ts`** — `readSession()` (HS256 `__session` JWT via `next-firebase-auth-edge`)

### Routes and actions

| Path | Role |
|---|---|
| `app/api/auth/session/route.ts` | Sign-in, device adoption, session mint, device cookie set |
| `app/api/auth/signout/route.ts` | Revoke refresh tokens, clear `__session` (**not** `att_device`) |
| `app/api/mobile/attendance/register-device/route.ts` | The only `skipDeviceCheck: true` endpoint |
| `app/(app)/attendance/devices/actions.ts` | `approveDevice()` · `revokeDevice()` · `registerDeviceForEmployee()` · `auditDeviceChange()` · `setOfficeIpAllowlist()` |
| `app/(app)/attendance/actions.ts:157` | Web punch device re-check |
| `lib/security/attendance-authorization.ts:90` | Third check + laptop-only rule for editing others |

### UI

| Path | Role |
|---|---|
| `app/device-blocked/page.tsx` | Where an unauthorized device lands. Outside the `(app)` group so it inherits no chrome |
| `app/(app)/attendance/devices/page.tsx` | Registered Devices admin screen; shows both rollout switches as badges |
| `components/attendance/devices-client.tsx` | Approve / revoke / register UI; `deviceTypeName()` |
| `components/auth/login-form-canva.tsx` | `DeviceNotAuthorizedError`, `exchangeIdTokenForSession()` |

### Data

- `db/schema.ts:2030` — `mobileDevices`
- `db/schema.ts:2359` — `webauthnCredentials`
- `db/schema.ts:371` — `authSessions` (dead; see Appendix 3)
- `db/enums.ts:1391` — `DEVICE_KINDS`, `DeviceKind`, `DEVICE_KIND_LABELS`
- Migrations: `0063_mobile_devices.sql` · `0102_device_push_tokens.sql` · `0205a_mobile_device_approval_columns.sql` · `0206_device_kind_laptop_phone.sql` · `0214_two_approved_devices_any_kind.sql` · `0215_device_access_and_attendance_audit.sql`

### Native

`android-app/app/src/main/java/com/altuscorp/altus/core/util/DeviceId.kt` — `id`, `label`, `platform`, `keystoreBackedId()`, `generateKey()`, `persistedFallbackId()`

### Tests

`tests/unit/device-access.test.ts` · `tests/unit/device-exemption-login.test.ts` · `tests/unit/device-self-registration.test.ts`

---

## L. Recommended Direction — no implementation

Ordered by pain removed per unit of risk incurred. **Nothing below has been implemented.**

### L1. Fix the `setDeviceStatus` cap count — do this first

One missing predicate at `lib/attendance/mobile-devices.ts:383`: the query needs `eq(mobileDevices.kind, row.kind)`. It contradicts its own comment, the database already enforces the correct rule, and it is almost certainly the direct cause of the reported revoke/approve cycles. Lowest risk, highest return available.

### L2. Separate "Android browser" from "Android app"

One slot is being contested by two genuinely different clients. Either introduce a third `kind`, or key the slot on `(kind, platform)` rather than `kind` alone. Without this, anyone who uses both the native app and a phone browser is permanently stuck, and no amount of approving will settle it.

Also consider whether `describeRequestDevice`'s regex should treat tablets as laptops.

### L3. Stop rotating the cookie on a foreign row

In `adoptDeviceOnLogin` (`device-access.ts:333`), before minting a new UUID, look up **this employee's own existing row** by `employee_id` + `kind` and reuse its `device_id`. A shared browser profile would then swap cleanly between two stable identities instead of manufacturing a new pending row on every alternation.

### L4. Sign the cookie

An HMAC over the device id using `COOKIE_SECRET_CURRENT` makes hand-edited values detectable. It does **not** stop copying a valid cookie, but it costs nothing and closes casual tampering. Keep the same underlying `device_id` in the database so no employee re-enrols.

### L5. Bind the session to the device

Put the device id (or its hash) into the `__session` JWT claims at mint time and compare it against the cookie on each request. This is the single change that makes cookie/session theft tamper-evident, and it turns the two independent bearer tokens into one bound pair.

Note the migration cost: every existing session would need to be re-minted, so this wants a grace period where a missing claim is tolerated.

### L6. Close the route-handler gaps

The five surfaces in [I1](#i1-route-handlers-bypass-the-device-gate) should route through `requireUser()` or call `resolveDeviceContext()` explicitly — `fetchMonthLedger` (salary) and the agreements PDF route most urgently. Until then the honest claim is "an unregistered laptop cannot use the WMS UI", not "cannot use the WMS".

A lint rule or a test that asserts every Route Handler under `app/(app)/` calls a device-checking guard would stop the gap reopening.

### L7. For real hardware binding, WebAuthn is already here

`webauthn_credentials` and `lib/webauthn/attendance.ts` already register platform authenticators (TPM / Secure Enclave / Windows Hello) and already carry a `device_label`. A platform passkey is non-extractable, survives cookie clearing, and is the only true hardware-bound identity a browser can offer.

Registering one per laptop **alongside** the cookie would give web parity with the phone's keystore id and would make L4 and L5 largely redundant. It would also solve the "cleared cookies" re-approval case entirely, which is the most common legitimate cause.

Caveats worth planning for: the RP ID is host-derived (`lib/webauthn/attendance.ts:26`), so it is domain-bound; and a Windows Hello passkey does not roam between OS user profiles.

### L8. Do not reach for fingerprinting

UA, screen, timezone, canvas and fonts are all trivially spoofable, drift on browser updates, and are shared across identical corporate laptops. They produce false positives and false negatives simultaneously — the worst combination for an access decision. Migration 0215 explicitly rejected storing them, and that decision should stand.

### L9. Add a `status` CHECK constraint

`CHECK (status IN ('approved','pending','revoked'))`, and consider a real enum. Also reconcile `getDeviceStatusFor()` (fails open) with `resolveDeviceContext()` (fails closed) so the two agree on what a non-standard value means.

### L10. Decide the `DEVICE_AUTO_ADOPT` endgame — and build a rescue path first

Before setting it to `off`, give device managers a way back in: a break-glass path, a second exempt account, or a CLI/admin script that can approve a device without going through `requireUser()`. Otherwise the three people who can approve devices are one cache-clear away from nobody being able to approve anything.

### L11. Consider a "primary device" concept only if the cap changes

There is no primary/active flag today, and with a cap of one approved per kind there is nothing for it to disambiguate. If the cap is ever raised (two laptops, say), a primary flag becomes necessary to decide which device the audit trail treats as canonical.

---

## Appendix 1 — Environment switches

| Variable | Default | Effect |
|---|---|---|
| `DEVICE_ACCESS_ENFORCEMENT` | unset → **enforcing** | `"off"` disables the gate entirely, web **and** native. The only master switch. `.env.example:234` |
| `DEVICE_AUTO_ADOPT` | unset → **open** | `"off"` closes first-device self-approval; every new device then needs an administrator. `.env.example:248` |
| `DEVICE_ACCESS_MOBILE_GRACE_UNTIL` | unset → **no grace** | A **date**. While in the future, a native request with **no** device id is allowed. Unparseable → treated as off, with a warning |
| `ALLOW_INSECURE_COOKIES` | unset | `"true"` drops the `secure` flag in production |
| `COOKIE_SECRET_CURRENT` / `_PREVIOUS` | required | HS256 signing keys for `__session`. **Not currently used for `att_device`** |

Both device switches are surfaced as badges on `app/(app)/attendance/devices/page.tsx:86` so their state is visible on the screen where it matters, not buried in an environment variable.

---

## Appendix 2 — Migration history of the cap

| Migration | Rule | Mechanism |
|---|---|---|
| **0063** | Device binding introduced for the native app | `mobile_devices` created |
| **0205a** | Approval lifecycle added | `status`, `approved_by_id`, `approved_at`, `revoked_at` |
| **0206** | **One approved per kind** (one laptop AND one phone) | Partial unique index `(employee_id, kind) WHERE status='approved'` |
| **0214** | **Two approved of ANY kind** | Index **dropped**; replaced by a trigger with an advisory lock, because cardinality is not expressible as a unique index |
| **0215** | **Back to one approved per kind** — **CURRENT** | Trigger function replaced (`CREATE OR REPLACE`, so there is never a window with no cap) **and** the 0206 index recreated. Belt and braces |

Each migration includes a data-reconciliation `UPDATE` that revokes excess approved rows, keeping the most recently used — so a restored or older database cannot make the new constraint fail on creation.

0215's reconciliation records a real revocation with a reason (`'Superseded by the one-laptop-one-phone rule (migration 0215)'`) rather than a silent status flip, so it appears in device history like any other.

**Total capacity has never changed: two devices per person.** Only the shape has.

---

## Appendix 3 — Incidental findings outside the brief

These came up during the trace. Recording them so they are not lost; **none was acted on.**

1. **`auth_sessions` is never written.** `grep "insert(authSessions"` across the repo returns **no matches**. The table is only ever read, revoked from, or deleted. Consequences:
   - The `/profile` → Identity → "Active sessions" list (`lib/profile/queries.ts:99`) is **permanently empty**
   - The `user_agent`, `ip_hash`, `country` and `city` columns are dead code
   - `lib/profile/this-device.ts` `getThisDeviceSessionHash()` unconditionally `return null` — its own comment admits the hash cannot be computed, and marks it as a chunk-1 placeholder that was never revisited
   - The sign-out route's comment about preventing "the multiple sessions pile-up" describes behaviour that cannot occur, since no rows are ever created

2. **There is no middleware**, so every code comment referring to "the middleware" is stale — at minimum `components/auth/login-form-canva.tsx:78` and `lib/auth/session.ts:13`.

3. **Comment drift in `app/(app)/attendance/devices/page.tsx:26`** — the docblock still says *"cap MAX_DEVICES_PER_EMPLOYEE per person, any mix of kinds"*, which is the retired 0214 rule. The rendered copy below it is correct.

4. **Comment drift in `db/schema.ts:2041`** — `kind` is described as *"DESCRIPTIVE ONLY since 0214"*, but 0215 made it decisive again. The index comment 30 lines below says the opposite, correctly.

5. **`registerMobileDevice`'s docblock** (`mobile-devices.ts:145`) still references `lib/attendance/web-device.ts` as the laptop path. That module is retired.

6. **`app/api/mobile/attendance/register-device/route.ts:20`** documents enrolling as `PENDING` awaiting admin approval. Since 2026-09-09 it enrols as `approved`. The code is right; the comment is stale.

---

*End of audit. No code, schema, configuration, authentication behaviour or UI was modified in producing this document.*
