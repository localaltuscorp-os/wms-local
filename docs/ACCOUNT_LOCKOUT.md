# Account lockout — build log and handover

**Branch:** `feat/account-lockout`
**Status:** ALL FOUR PHASES COMPLETE, verified end to end against production Firebase
(2026-09-18). Sign-in now goes through the server, wrong passwords are counted, the
fifth locks the address, and only the four can release it.
**Built on `main`:** 2026-09-18 (`bc80ebd9`)

> **For whoever takes this to production:** jump to
> [Going live](#going-live). It is the only section you must read.
> **For anyone pulling this branch:** read [Working on this branch](#working-on-this-branch).

---

## The requirement

1. Lock an account after **5 consecutive wrong passwords**
2. Warn the person as they go — *"3 attempts left"*, *"2 attempts left"*
3. Only **Mohit, Rohan, Jeevan and Manan** can unlock
4. While locked, the person **cannot use Forgot Password** either. Reset becomes
   available only once one of the four has unlocked them.

There is **no timer**. A lock ends when a human ends it.

---

## Phases

| Phase | What | Status |
|---|---|---|
| **1** | Migration, capability module, state machine, tests | ✅ **done** |
| **2** | `/api/auth/login` server route; login form rewritten to use it | ✅ **done** |
| **3** | Locking at 5; countdown messages; Forgot Password guard | ✅ **done** |
| **4** | Unlock screen, `pnpm unlock` break-glass | ✅ **done** |

Phases 2 and 3 are deliberately separate. Phase 2 moves **every login in the
company** onto a new code path; that wants a few days of proving before the same
path can also lock people out.

---

## Who can unlock: an assignable ROLE (2026-09-18)

The requirement first named four people, then asked for "one more additional
role … we will just give them role and they can do it". So unlocking is now a
role somebody can be **given in the app**, with no code change and no deploy.

**The role list is code; the grants are data.** `lib/auth/security-roles-catalog.ts`
defines `account_unlock`; `security_role_grants` (migration 0238) records who
holds it. A role nobody enforces would be a switch wired to nothing, so adding a
role stays a code change — handing it out does not. This is the same split
`lib/permissions/catalog.ts` documents for the permission tree.

### Why none of the three existing mechanisms fit

| Mechanism | Why not |
|---|---|
| `module_permissions` (0219) | A RESTRICT system: with no row the resolver answers `allowAll()`. Unlocking would be open to everybody until each person was switched off. |
| `lib/security/capabilities.ts` | Grants by email **in code** — right for capabilities that must not move without review, but it means a developer and a deploy for every new unlocker. |
| `employees.is_admin` | One flag for everything an admin does, and the sets differ: **Jeevan is not an admin**, while Om, Rutvisha, Shreya and Vinal are. "Admins only" would have handed it to four more people and taken it from Jeevan. |

### The rules

- **The four named addresses are a floor in code** and cannot be revoked from the
  screen. A lockout feature whose release valve can be switched off in a UI can
  lock the whole company out.
- **Holding the role ≠ handing it out.** Granting is limited to those four plus
  super-admins (`mayGrantSecurityRoles`), so the role cannot spread by itself.
- **A holder can never be locked out**, by grant or by code floor — otherwise five
  wrong passwords against each holder would leave nobody able to release anybody.
- **Grants fail CLOSED**: an unreadable `security_role_grants` hands the role to
  nobody, while the lockout reads deliberately fail OPEN so a database hiccup
  cannot lock out the company. Opposite defaults, on purpose.
- Every grant and revoke is recorded in `security_role_events` with who did it.

Managed on **/account-locks** → "Who can unlock accounts": pick a person, Give
role. Verified on production data: Jeevan (a granted holder, not an admin) is
exempt after five failures while a non-holder locks at five.

## Phases 2–4 — what shipped (2026-09-18)

| File | |
|---|---|
| `app/api/auth/login/route.ts` | The server-side credential exchange. Refuses a locked address BEFORE asking Firebase, counts every refusal, clears the streak on success, mints the session, and returns a one-time custom token |
| `lib/auth/session-mint.ts` | The cookie minting, lifted out of `/api/auth/session` unchanged so both routes mint identically |
| `lib/auth/lockout-copy.ts` | Every sentence the person reads, in one place (client-safe) |
| `components/auth/login-form-canva.tsx` | Posts to the route; no longer calls Firebase with the password. Exchanges the custom token so sign-out / idle timer / change-password keep working |
| `app/(auth)/forgot-password/actions.ts` | Refuses to send a reset link while the address is locked |
| `app/(app)/account-locks/` + `components/auth/account-locks-screen.tsx` | The unlock screen |
| `scripts/unlock-account.ts` + `pnpm unlock` | Break-glass |
| `proxy.ts` | `/api/auth/login` added to `PUBLIC_API` — sign-in is by definition reached without a session |
| `db/migrations/0237_account_lockouts.sql` | Renumbered from 0236, which Vinal's `0236_recruitment_jd_roles.sql` now owns on main |

**Phase 1's counter never worked.** Every write failed with the driver's own
complaint — *"the string argument must be of type string … Received an instance
of Date"* — because `recordFailedAttempt` interpolated JS `Date` objects into raw
SQL fragments, where a value carries no column type to map it by. The failures
were caught and logged, so nothing surfaced: the countdown never appeared and no
account could reach five. Postgres now does the window arithmetic (`now() -
interval …`), which also removes app-vs-database clock skew.

**`components/auth/login-form-glass.tsx` was deleted.** It was unreferenced and
still held the old browser-side `signInWithEmailAndPassword`, i.e. a path that
would have bypassed counting entirely if anyone had wired it up again.

### Verified against production Firebase (not mocks)

```
attempt 1 → 401  Wrong password. Try again, or reset it below.
attempt 2 → 401  Wrong password. 3 attempts left before your account locks.
attempt 3 → 401  Wrong password. 2 attempts left before your account locks.
attempt 4 → 401  Wrong password. 1 attempt left — the next wrong password locks your account.
attempt 5 → 423  locked, pointing at "your WMS administrator" (no names)
attempt 6 → 423  still locked
```

Then, with a throwaway Firebase user (created and deleted by the probe, no
employees row): two wrong attempts recorded `failed_count=2`, the CORRECT
password was accepted and reset it to `failed_count=0`. `pnpm unlock <email>
--apply` cleared a real lock and the address could attempt again.

Still true, and deliberate: Google sign-in has no password to count; the
set-password screen signs in with the password the person just chose; the four
unlockers cannot be locked out.

## Phase 1 — what shipped

| File | |
|---|---|
| `db/migrations/0236_account_lockouts.sql` | `account_lockouts` + `login_attempt_ips` |
| `lib/auth/unlock-permission.ts` | The four unlockers, thresholds, exemption |
| `lib/auth/account-lockout.ts` | The state machine — `server-only` |
| `tests/unit/unlock-permission.test.ts` | 11 tests |
| `db/schema.ts` | Drizzle definitions for both tables (appended at end) |
| `.github/workflows/ci.yml` | Unrelated CI fix — see [CI](#ci-fix-included-here) |

**Verified:** `tsc --noEmit` 0 errors project-wide; 11/11 tests pass.

**Nothing imports `account-lockout.ts` yet.** It ships ahead of the route on
purpose — migration first, helpers second, behaviour third. The reverse order is
what caused the 2026-09-09 login outage, where `db/schema.ts` shipped columns
whose migration had never run and every `employees` query died with `42703`.

---

## Decisions already made

Recorded so nobody has to re-litigate them, and so the reasoning survives.

### The counter must live server-side

Sign-in currently runs **in the browser** — `signInWithEmailAndPassword` against
Firebase. A wrong password never reaches our server, so today there is nothing to
count.

The rejected alternative was having the browser report its own failures. That
counts honest users and nobody else: the Firebase web API key ships in the page,
so anyone who would rather not be counted calls Firebase's REST API directly and
brute-forces freely. **A counter the subject can decline to increment is not a
control.** Hence Phase 2 moves the credential exchange onto the server.

### A new capability, not `isSuperAdmin`

`SUPER_ADMIN_EMAILS` contains Rohan and Manan only, and grants **admin
promotion and demotion** — strictly more power than unlocking. It was
deliberately narrowed to two people during the 2026-09-04 incident; widening it
to fit this feature would undo that.

A **code list**, not a database flag or env var, for the reason
`lib/auth/super-admin.ts` records: an env-var escape hatch once let anyone who
could set a Vercel variable grant themselves the privilege, with no code review
and no git history. A `can_unlock` column would have the same weakness — any
writer to `employees` could set it.

### The four unlockers cannot themselves be locked out

Their addresses are guessable. If all four could be locked, five wrong passwords
against each would leave **nobody able to release anybody** — a company-wide
outage anyone on the internet could trigger.

The trade-off is accepted and explicit: those four rely on password strength and
Firebase's own `auth/too-many-requests` throttle. They could undo any lockout on
themselves anyway, so locking them buys nothing.

`scripts/unlock-account.ts` (Phase 4) is the second break-glass, for when the app
itself cannot be reached.

### The countdown *is* an enumeration leak

*"3 attempts left"* tells whoever is typing that the address is a real account.
This cannot be engineered away — a countdown that does not reveal whether the
account exists is a contradiction.

**Accepted deliberately**, because the requirement asks for the warnings. The
mitigation is the **per-IP throttle**, which makes sweeping a list of addresses
expensive. It is not the message.

Note this is a *change*: Firebase's email-enumeration protection is currently on,
so today the app leaks nothing here.

### Keyed by email, not employee id

A failed attempt proves someone typed an address, not who they are, and the
address may belong to nobody — the attempts most worth counting are those against
addresses that don't exist. `employee_id` is a nullable convenience for the admin
screen, not the record's identity.

### One atomic upsert, not read-then-write

Two concurrent attempts would otherwise both read `3` and both write `4`, losing
a failure. That is precisely the hole a brute-force script widens by running
requests in parallel. The increment and the lock decision happen in a single
statement, evaluated by Postgres against the stored row.

### `failed_count` ages out after 24 hours; the lock does not

"Consecutive" is handled by zeroing the count on a successful sign-in. The
24-hour window is the separate question of whether five failures spread over
months should still lock — they should not, or a mistyped password in January
contributes to a lockout in March.

There is no `locked_until` column. A timed release would let a brute-force
attempt simply wait.

---

## Going live

### 1. Run the migration — **before** any Phase 2+ code deploys

```
db/migrations/0236_account_lockouts.sql
```

Additive only: two new tables, no change to any existing one. Nothing reads them
until Phase 2, so it is safe to run now and **should** be run now.

Verify:

```sql
SELECT count(*) FROM information_schema.tables
 WHERE table_name IN ('account_lockouts','login_attempt_ips');   -- expect 2
```

### 2. Note on migration numbering

Originally written as `0216`; renumbered to **`0236`** on 2026-09-17 because
`main` already had `0216_incentive_eligibility.sql` and
`0216_module_submission_attachments.sql`. This repo has several duplicate
migration prefixes already — **check the highest number on `main` before adding
another**, do not assume.

### 3. Nothing else

Phase 1 changes no behaviour. There is no env var, no feature flag, no rollback
step. If the migration has run and the app is deployed, you are done until Phase
2 exists.

### CI fix included here

`.github/workflows/ci.yml` gains `NODE_OPTIONS: --max-old-space-size=6144`.

Unrelated to lockout, but shipped alongside because this feature sits on the
login path and needs a suite that completes. CI had been failing on **every run
for days** — not a failing test, but `FATAL ERROR: Reached heap limit` and exit
code `134` (SIGABRT) at ~65 seconds. Node's 2 GB default no longer holds ~240
tables plus 800+ routes plus the unit suite.

**Upstream `Altus-corp/Altus-OS` has the identical failure** and needs the same
one-line change.

---

## Working on this branch

```bash
git fetch origin
git checkout feat/account-lockout
pnpm install --frozen-lockfile
```

Run what CI runs:

```bash
NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck
NODE_OPTIONS=--max-old-space-size=4096 pnpm test
```

### Keeping it conflict-free with `main`

`main` moves fast — it took **82 commits** in the six days after this branch was
first cut. Rebase regularly rather than letting it drift:

```bash
git fetch origin
git rebase origin/main
```

**The conflict you will hit is `db/schema.ts`**, every time. Both sides append
new tables at the end of the file, so git interleaves them. It is always a
**union, never a choice** — nobody is editing the same table. The reliable
resolution:

```bash
git checkout --ours db/schema.ts      # take main's version wholesale
# then re-append the accountLockouts + loginAttemptIps blocks at the end
git add db/schema.ts
git rebase --continue
```

Check before you push:

```bash
git merge-tree --write-tree origin/main HEAD >/dev/null && echo CLEAN || echo CONFLICTS
```

### Do not merge into `main` yet

Phase 1 is inert, so merging it early is harmless — but the branch is the unit of
review here. Land it when Phase 2 is ready, or open a PR and keep rebasing.

---

## Open questions

- **Phase 2 scope:** the login form rewrite touches `login-form-glass.tsx` and
  `login-form-canva.tsx` — are both still in use, or can one be retired first?
- **Rate-limit policy:** `lib/rate-limit.ts` already exists. Phase 2 should
  probably route the per-IP throttle through it rather than adding a second
  mechanism. Worth a look before building.
- **Where the unlock UI lives:** a new admin screen, or a row action on the
  existing employees table? Phase 4.

---

## Change log

| Date | |
|---|---|
| 2026-09-17 | Phase 1 committed. Migration renumbered `0216` → `0236`; rebased onto `main` `4513a438`; verified clean merge, 0 typecheck errors, 11/11 tests. |
