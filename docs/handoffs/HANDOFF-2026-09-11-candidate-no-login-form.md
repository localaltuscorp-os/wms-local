# HANDOFF — Pre-Interview: candidate form without a login

**Date:** 2026-09-11
**Branch:** `Rudra`
**Audience:** the next session picking this up, and whoever deploys it.

> Structure follows [`HANDOFF-Rudra.md`](./HANDOFF-Rudra.md).
> **Everything below is uncommitted.** Nothing has been staged, committed or pushed.

---

## 1. The ask

> "In the HR module, in Pre-Interview — anyone from outside the organisation — when we type
> their basic details (first name, last name, cell no and email address) they should get the
> candidate interview form, and they should be allowed to edit that form after they fill it,
> without logging in to our OS."

## 2. Status

**Done and verified end-to-end on the server side.** Not yet exercised through a browser.

What was already in the repo before today (untracked groundwork, author unknown to this
session): migration `0221_candidate_access_links.sql`, `lib/hr/candidate/access-link.ts`,
`access-link-cookie.ts`, `access-link-email.ts`, the `/c` entry in `proxy.ts`, the `/c/form`
re-export, and the access-link branch inside `requireCandidateOwner`. Today's work is the
HR-facing half, the public pages, the post-submit-edit behaviour, and three bug fixes.

---

## 3. Run this SQL — already done on Supabase, read this before deploying elsewhere

**One migration:** `db/migrations/0221_candidate_access_links.sql` — one `CREATE TABLE IF NOT
EXISTS` plus one `CREATE INDEX IF NOT EXISTS`. Nothing existing is read, altered or deleted.

**Already applied on 2026-09-11 to:**
- Supabase project `ifcdpjbdinvmtewmgceg`, via
  `pnpm tsx --env-file=.env.local scripts/apply-one-migration.ts db/migrations/0221_candidate_access_links.sql --apply`
- the local PGlite fixture DB, via `pnpm dummy:setup` (no `--reset`; applied exactly 1
  migration, kept all data)

**DO NOT run `pnpm db:migrate` / `apply-all-migrations.ts` against a live database.** Its
ledger backfill only stamps up to `0028`, so on a populated DB it re-attempts migrations
0029–0104. Its dry-run is also useless — it only consults the ledger when `--apply` is
passed, so it reports all 241 migrations as "pending" regardless. Use
`scripts/apply-one-migration.ts` for a single named file.

**Unrelated gap noticed, someone else's to own:** 7 migrations are unapplied on production —
`0215_broadcast_popup_snooze`, `0215_device_access_and_attendance_audit`, `0216`–`0220`.
Not touched today.

---

## 4. How the feature works

1. HR opens **Pre-Interview** → **Send the Form to the Candidate** → types first name, last
   name, cell, email.
2. `inviteCandidateByLink` creates the `candidate_intake` row (pre-filled with those four
   answers under the wizard's own value keys) and a candidate `employees` row —
   `account_type='candidate'`, `is_active=false`, `candidate_active=true`, and **no
   `firebase_uid`**. There is no account to sign in to, by design.
3. It mints a 256-bit token (only the SHA-256 is stored), emails the link, and shows the URL
   **once** in the dialog. The plaintext is never stored, so "copy it again later" is
   impossible by construction — the only way to get a working URL is to mint a fresh one,
   which revokes the previous.
4. The candidate opens `/c/<token>`. That route swaps the token for an HttpOnly,
   `Path=/c`, `SameSite=Lax` cookie and redirects to a clean `/c/form`, so the token is in
   the address bar for exactly one request.
5. `/c/form` re-exports the signed-in candidate page. `requireCandidateOwner` resolves the
   row from the cookie, re-reading expiry, revocation and candidate liveness **on every
   request and every write**.
6. Submit stamps `submitted_at` and stops there — the link is NOT revoked and the candidate
   is NOT deactivated, so they can return and correct anything for the full 30 days.

Recovery: `/c/resume` mails a fresh link. It answers with the same sentence whatever
happens, so it cannot be used to discover who applied.

---

## 5. Files

**New (today)**
- `app/(app)/hr/candidate-invite-actions.ts` — `inviteCandidateByLink`,
  `resendCandidateFormLink`, `revokeCandidateFormLink`
- `components/hr/candidate/invite-candidate-dialog.tsx` — the four-field dialog + show-once URL
- `app/c/[token]/route.ts` — the door (Route Handler, see §7)
- `app/c/expired/page.tsx` — one page for every dead-link cause
- `app/c/layout.tsx`, `app/c/resume/page.tsx`, `app/c/resume/actions.ts`,
  `app/c/resume/resume-link-form.tsx`

**Modified (today)**
- `lib/hr/candidate/candidate-owner.ts` — returns `viaLink: boolean`
- `app/candidate/candidate-self-actions.ts` — post-submit writes allowed when `viaLink`;
  the account is only deactivated on the signed-in path
- `app/candidate/form/page.tsx` — passes `viaLink` / `submitted` down; opens at the review
  step for a returning link candidate
- `components/hr/candidate/candidate-form-launcher.tsx` — "Edit my answers" on the
  thank-you, "already submitted" banner
- `components/hr/candidate/intake-chooser-popup.tsx` — the new Pre-Interview option
- `components/hr/candidate/basic-details-screen.tsx` — toolbar button, row menu
  Send/Cancel link, show-once copy banner
- `lib/hr/candidate/access-link-cookie.ts` — exported `candidateLinkCookieOptions`

---

## 6. What was tested, and how

Driven against the dev server through two throwaway route handlers (`app/api/tmpinvite`,
`app/api/tmpcand`) that called the **real** server actions. Both were deleted afterwards, and
the test candidate was deleted via `deleteCandidateIntake`.

| Step | Result |
|---|---|
| `inviteCandidateByLink` | `ok:true`, candidate + link created |
| `GET /c/<token>` | 303 → `/c/form`, `HttpOnly; Path=/c; SameSite=Lax`, 30-day expiry |
| `GET /c/form` + cookie | 200, name / cell / email / position pre-filled, no login |
| save → submit → **save again** → **submit again** | all four `ok:true` — **the requirement** |
| reload after the post-submit edit | edit persisted; "already submitted" banner shown |
| no cookie | `NEXT_REDIRECT` — bounced, no write |
| revoked link | token → `/c/expired`; stale cookie leaks nothing and cannot write |

`tsc --noEmit` clean. Lint clean for these files (3 pre-existing errors remain in
`intake-section-step.tsx` and `management-assessment-screen.tsx` — not from this work).

---

## 7. Three bugs found and fixed today — worth knowing about

1. **Cookie written during a Server Component render.** `/c/[token]` was a `page.tsx`
   calling `cookies().set()`. Next 16 throws on that — it is only legal in a Server Action
   or Route Handler. Every candidate's link would have errored. Now a `route.ts` that sets
   the cookie on its own 303 response.
2. **Folder named `__tmp-invite` 404'd.** Next excludes folders starting with `_` from
   routing. Only affected the test harness, but it is an easy trap.
3. **Wrong database assumed.** `.env.local`'s `DATABASE_URL` points at Supabase, but the dev
   server runs `pnpm dev:dummy` (`DUMMY_MODE=true`) and reads PGlite in `.pglite/`. A
   migration applied to Supabase is invisible to it. The tell was `PglitePreparedQuery` in a
   stack trace. **A new migration generally needs applying twice.**

---

## 8. Not done — pick this up first

- **No browser pass.** The four-field dialog, the 108-field wizard, and the "Edit my
  answers" button have never been clicked. The server side behind them is proven; the UI is
  not. Do this before anything ships.
- **Real email delivery untested.** Dummy mode cannot send, so the action returned its
  "couldn't email — copy the link" fallback (which works). Resend delivery is unverified.
- **`NEXT_PUBLIC_SITE_URL` is `http://localhost:3000`.** The generated link pointed at port
  3000 while the server ran on 3002. On the deploy this MUST be the real domain or every
  emailed link is wrong.
- **Forms index.** A link-filled form is not mirrored into `hr_form_submissions` on submit,
  so it will not appear in **All Filled Forms**. This matches the existing signed-in
  candidate path (same gap) — fix both together or neither.
- **Uploads.** `uploadOwnCandidateFile` pins storage under `candidate-intake/<employeeId>/`.
  Untested on the link path, and dummy mode stores files on disk rather than in Supabase.

---

## 9. Environment left behind

- Dev server running on **port 3002 in dummy mode** (it was force-killed and restarted
  during testing; `.pglite` was backed up first and survived intact).
- `.pglite` backup: the session scratchpad, `scratchpad/pglite-backup`. Delete when happy.
- Working tree is dirty and deliberately uncommitted.
