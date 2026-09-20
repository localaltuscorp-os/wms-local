# HANDOFF — `Shreya` branch

**Updated:** 2026-09-20
**Repo:** `https://github.com/localaltuscorp-os/wms-local` · branch `Shreya`
**Database this was developed against:** Supabase ref `ifcdpjbdinvmtewmgceg`
(the one in `.env` → `DATABASE_URL`).
**Audience:** whoever picks this up, and whoever runs the SQL in Supabase.

---

## 1. SQL to run in Supabase

**`db/RUN-IN-SUPABASE-shreya.sql`** — one file, house style, safe to run twice.

**The short answer: this branch needs no schema change.** Every feature below
was built on columns that already exist. The file is not empty, though: it
carries a VERIFY block that checks all eleven objects the new code reads and
prints `OK` or `*** MISSING ***` per row. Run it and you know whether a database
can serve this branch.

Verified against `ifcdpjbdinvmtewmgceg` on 2026-09-20 — **11/11 OK**.

> **Check the project ref in the URL bar before running anything.** Three
> Supabase projects appear in this team's notes and two of them are not the one
> you want. See the warnings at the top of [`HANDOFF.md`](./HANDOFF.md).

### 1a. Drift that is NOT this branch's

Auditing the database on 2026-09-20 (281 tables in `db/schema.ts` against 311
live) found **ten tables in the schema that do not exist in the database**:

```
ai_usage                     rev_agent_runs      rev_lead_events
candidate_policy_signatures  rev_campaigns       rev_leads
punch_nonces                 rev_drafts          rev_suppression
                             rev_agent_audit
```

None belong to this branch and none are created by its SQL file. They are
recorded because **this project has no drizzle journal table** — nothing in the
database records which migrations have been applied — so a written drift list is
the only evidence there is. Whoever owns the revenue-agent and candidate-policy
work should say whether these are outstanding migrations or tables this database
is deliberately without.

---

## 2. What changed

### 2a. Billing — the room lost two screens

**Admin Master** (`/billing/admin-master`) and **Customer Master DD**
(`/billing/customers/dropdowns`) are gone, along with
`components/billing/dropdown-master-view.tsx`, `admin-master-view.tsx`,
`dummy-master-notice.tsx` (already dead), the six lookup-mutation server actions
in `app/(app)/billing/customers/actions.ts`, and both rail entries.

The rule the room now follows: **the only master data Billing owns is the
customer itself.** Everything an invoice is built from on the seller's side —
PAN, GSTIN, bank, signatory, number series — is a billing profile, entered in
Admin › Billing Profiles. One place to edit, one place to look.

KYC dropdowns still fill: `allLookupOptions()` falls back to the registry
defaults in `lib/billing/lookups.ts`, so nothing on the form went blank. They
are simply no longer editable from inside Billing.

`restoreFromBinAction` was kept — the Recycle Bin still restores options removed
before the editor was retired.

### 2b. Adding a company from the Admin Panel

`lib/billing/entities.ts` (new) — **the companies Billing can issue from.**

There are two sources and the module's header comment explains why at length.
`lib/hr/entities.ts` is a pure typed registry of the five legal entities, shared
with HR and salary, with committed logos. Right for the five; wrong as a place
to add a sixth at 9pm, because it needs a deploy.

So **a company added from Admin › Billing Profiles is a row in
`billing_entity_profiles` whose `entity_id` is not one of the five**:

```
entity_id  'meridian-holdings-llp'   <- a slug of the name typed on screen
legal_name 'Meridian Holdings LLP'   <- the name, and its display name
```

`entity_id` is free text with a unique index and no foreign key — which is what
made this possible without a migration. **The trade: a custom company has no
display name separate from its legal name.** A column was available and was not
taken; if that limit ever bites, that is where to start.

- **New company** button on the profiles screen → name → its card opens in edit
  mode, filled in by the same editor the five use.
- **Delete company** on a custom company's card. It refuses the five (their
  cards are drawn from the registry, so "deleting" one would wipe its PAN,
  GSTIN and bank and redraw the same card empty), and refuses any company with
  documents or contracts against it (they would be left naming a company that
  no longer exists). When nothing points at it, the profile row and its
  number-series rows go in one transaction.
- Both server guards (`saveBillingEntityProfile`, `saveBillingSeriesDefault`)
  now accept the five **or** a company that already has a row, so a typo cannot
  create an orphan profile.

**A bug this would have shipped with.** `buildSellerSnapshot` called
`getEntity(entityId)`, which answers an unknown slug with the *default* entity.
Left alone, every invoice from a new company would have printed under **Altus
Corp's** name and logo. `lib/billing/seller.ts` now keeps an unrecognised id and
takes its names from its own profile. Verified:

```
custom:   entityId 'meridian-holdings-llp'  displayName 'Meridian Holdings LLP'  logo null
registry: entityId 'unleashed'              displayName 'Unleashed'              logo /logos/unleashed.jpg
```

New companies flow through every screen that picks one — new/edit document, the
documents filter, all four contract screens — via `listBillingEntities()`.

### 2c. Customer KYC and the Customer Master

- **Onboard Client lands on the client you just created.** It used to
  `router.push("/billing/customers")` — the bare list, sorted by name and paged
  twenty at a time, so a new client opened on page 7 and the onboarding read as
  if it had done nothing. It now redirects to
  `/billing/customers?new=<id>&q=<name>`: the search box is seeded, a green
  banner names the client and its code with **Open the record** / **Show all
  clients**, and the row is tinted. `CollapsibleSearch` gained a `defaultOpen`
  prop so an arriving-filtered table explains itself.
- **A duplicate name no longer dumps SQL on screen.** The catch block tested
  drizzle's `.message` for `/unique|duplicate/`, but that message is only ever
  `Failed query: <sql> params: <values>` — so every duplicate fell through to
  the generic arm and printed the whole INSERT, **including the customer's name,
  GSTIN, PAN and notes among the bound parameters**. `lib/db/error.ts` gained
  `uniqueViolationConstraint()` (walks `.cause` for SQLSTATE 23505 and the index
  name); `billing_customers_name_uq` now yields a sentence, and everything else
  goes through `dbErrorMessage()`, which omits bound parameters by design.
  This fixes it for real clients too, not just test data.
- **Customer Address Book is a table** — one row per address, columns
  `Customer no. · Company · Type · Label · Address · City · State · Pin code ·
  Country · GSTIN`. It replaced a card-per-client layout where nothing lined up.
- **Both billing tables are one line per row, left aligned.** A shared cell
  shell (`px-3 py-2.5 text-left align-middle whitespace-nowrap`) that columns
  add to rather than replace — the old `align-top` plus a wrapping company name
  made a row five lines tall and pinned every neighbour to the ceiling. Long
  values clip at 240px with the full text on `title`.

### 2d. Billing documents

- **Notes are numbered.** `lib/billing/notes.ts` (new, pure) splits the stored
  remarks — one note per line — into labelled notes: one stays `Note :`, two or
  more become `Note 1 :`, `Note 2 :`. Wired into all three renderers (screen,
  PDF, email) so they can never disagree. Form boxes relabelled to match what
  prints (`Note`, `Note 2`, `Note 3`, button **Add note**); they used to say
  "Extra remark 1" for the text that printed as note 2.
- **The description column follows what you picked.** `descriptionNoun` on the
  view model: a line picked as Product carries a `productId`, a Service does
  not. So the caption is **Product Description**, **Service Description**, or
  **Product / Service Description** for a mixed document rather than
  mislabelling half of it.
- **A tax invoice now converts.** `CONVERSION_TARGETS.tax_invoice` was `[]` —
  "forward only, and never out of a tax invoice". It is now
  `["proforma_invoice", "quotation"]`. `convertBillingDocument` needed no change
  (it was type-agnostic), so the semantics are unchanged: the source is **frozen,
  not consumed** — it keeps its number and figures, gets status `converted`, and
  the new document is a draft linked both ways. A document still converts once.
  `tests/unit/billing-numbering.test.ts` updated; it still pins what stayed
  illegal (proforma → quotation, and any sideways conversion).
- **Convert stays on the page.** It used to bounce to the documents list — the
  one screen that does not show the result. It now converts in place and the
  "Converted to …" link appears.
- **Both riders removed by name.** The quotation's "Prices are valid subject to
  confirmation" and the proforma's "This is not a tax invoice". Since neither
  remained, the `rider` field was taken out of the view model rather than left
  always-null. The title at the top of the sheet identifies the document.
- **The KYC summary panel is gone** from the document form (client code,
  billing address, PAN, contact, shipping, payment terms) along with the
  Address field's "Fetched from the customer's KYC" caption. The fields the form
  actually uses from the KYC still fill in.
- **View on an attached contract**, in both states. A picked-but-not-uploaded
  file opens via an object URL over the bytes already in the browser (revoked on
  a 60s timer — revoking in the same tick cancels the tab that just opened).
  Previously the only way to check you had attached the right document was to
  save and come back.

### 2e. Performance — the admin screen that took four minutes

`/admin/billing-profiles` rendered in **2.5–4 minutes**. The four tables it
reads answer in 43–490ms each from a fresh connection, and all four in parallel
in 501ms. The time was not query cost, it was **queueing**.

Five statements fired in one `Promise.all` against the Supabase transaction
pooler. A stalled statement holds its pool slot until Supabase's 2-minute
`statement_timeout` releases it; a reload adds five more and the pool collapses.
The slow-query log showed clusters finishing at identical 87s / 155s / 251s
marks — the signature of waiting on one blockage, not of slow queries.

This codebase already knew. `getBillingFormData` in
`lib/queries/billing-documents.ts` carries the note *"SEQUENTIAL on purpose.
Firing all five at once against the Supabase pooler repeatedly left one
statement stalled or cancelled … and the New Document page stuck on
'Loading…'."* The admin page had never been given the same treatment.

It now awaits its five reads in a row — ~600ms end to end, so the parallelism
was buying milliseconds and costing minutes. **Measured after: 0.48–0.64s.**

The page also read `billing_entity_profiles` twice; it now builds both the cards
and the company list off the rows it already has (`billingEntitiesFrom`).

**If a dev session goes slow again**, the pool is the first suspect, not the
database: restart `next dev`. Clear `.next` too if routes start 404-ing after a
kill — a stale Turbopack manifest looks exactly like a deleted route.

---

## 3. State of the tests

`tsc --noEmit` and `eslint` are clean across every file touched.

`tests/unit/billing-invoice-view.test.tsx` has **2 failures that predate this
branch** — "prints the seller's identity and bank block off the snapshot" and
"labels IGST at the full rate across a state line". Verified by reverting this
branch's change to that component and re-running: the same 2 fail either way.
Every other billing test file passes.

Across all of `tests/unit` there are 14 failing files; the other 12 are in
unrelated areas (tasks, plan-sync, device login) and were not touched here.

---

## 4. Not done

- **The merge from `wms/main` is NOT done.** The work IS committed (see §5) and
  the tree is clean, but the merge was attempted, hit 23 conflicts that are
  product decisions rather than merge mechanics, and was aborted. §5 lists them.
- **The ten drifted tables in §1a** are unexplained and unowned.
- **A custom company has no logo** until one is set on its profile, and no
  display name separate from its legal name (§2b).

---

## 5. The merge from `wms/main`, and why it stopped

### 5a. What was done

The 376 uncommitted changes in the tree were committed to a new local branch
`Shreya` at `63407627`. **Nothing was pushed.** `main` is untouched and still
sits at `0a6c5db3`.

```
Shreya  63407627  Billing: one place for master data, companies you can add, …
main    0a6c5db3  (unchanged, tracks wms/main, behind 55)
```

`origin` (`MananVasa-support/Manan-Vasa`) returns **"Repository not found"** —
no access from this machine. The live remote is `wms`
(`localaltuscorp-os/wms-local`). The stale `origin/main` ref still in this clone
is 887 commits from HEAD and is **not** the branch anyone means by "main";
merging it would be a mistake.

### 5b. What happened when the merge ran

`git merge wms/main` — 55 commits, 695 files — produced **23 conflicts**, then
`git merge --abort` restored the tree. Three resolved cleanly before the abort
and are recorded here so the next attempt does not re-litigate them:

- `components/dcc/dcc-board.tsx`, `dcc-gate-view.tsx`,
  `dcc-manager-review-gate.tsx` — **accept the delete.** Upstream `f7c7bc42`
  ("Rebuild DCC from a written spec") removed them deliberately, and the only
  surviving local reference is a comment in `lib/dcc/dashboard.ts`.

### 5c. The 20 that need an owner

These are not merge mechanics. **The two branches made opposite decisions and
each recorded a reason**, so picking a side by hand would silently revert
somebody's explicit instruction.

**The big one — two incompatible status architectures.** They collide across
tasks, goals and project-plan:

| | this branch (HEAD) | `wms/main` |
|---|---|---|
| module | `lib/status/axes` | `lib/status/approver-status` |
| control | `DoerStatusSelect`, `InitiatorStatusSelect` | `ApproverChip` |
| server action | `setGoalInitiatorStatus` (`initiator-actions.ts`) | `setGoalApproverStatus` (`approver-actions.ts`) |
| helpers | `INITIATOR_STATUSES`, `INITIATOR_STATUS_LABEL`, `STATUS_TONE` | `approverDisplay`, `approverStored`, `selectableApproverChoices`, `canSetApproverStatus` |

Resolving it means choosing which survives and rewriting the other side's call
sites. That is a piece of work, not a conflict resolution.

**A directly contradictory product instruction.** `components/tasks/task-table.tsx`:
this branch REMOVED the Initiator Status column, citing Manan on 2026-09-15 —
*"remove initiator status from task table, goals tables and project tables as
well — don't remove from kanban section"*. `wms/main` ADDS IT BACK, citing the
same date. One of those is current and the file cannot say which.

Others in the same category:

- `components/hr/letters/letter-editor.tsx` — this branch removed the Candidate
  dropdown ("Replaces the old Candidate + Attach-Employee dropdowns"); upstream
  keeps and expands it.
- `app/(app)/tasks/kanban/page.tsx` — two different implementations of the same
  fix (default the board's scope to the viewer): `defaultDoerId` conditioned on
  `me.isAdmin` here, `defaultScopeId(me)` upstream.
- `components/attendance/insights/finance/finance-dashboard.tsx` — "Payroll Loss
  by **Department**" vs "by **Function**". A vocabulary decision.
- `components/incentive/incentive-targets.tsx`, `incentive-entries.tsx` — "Rs."
  vs "₹", and a different field set on the entry form.
- `components/hr/candidate/invite-candidate-dialog.tsx` — `formatDate` vs
  `formatDateHr` (upstream states every HR date as DD-MMM-YYYY).
- `package.json` — `dev:dummy` differs: this branch runs `dummy:setup` first,
  upstream sets `NEXT_DIST_DIR=.next-dummy` and
  `DEVICE_ACCESS_ENFORCEMENT=off`. Probably wants both.
- `lib/types.ts`, `lib/queries/tasks.ts` — `ApprovalStatus` (named type here)
  vs the inlined union upstream. Mechanical, but it follows the architecture
  decision above.
- `db/schema.ts`, `lib/permissions/catalog.ts`, `components/layout/main-nav.tsx`,
  `lib/attendance/confirmations.ts`, `scripts/dummy-db-seed.ts` — genuinely
  additive on both sides; keep both halves.

Full list: `app/(app)/dcc/dashboard/page.tsx`, `app/(app)/tasks/kanban/page.tsx`,
`components/attendance/insights/finance/finance-dashboard.tsx`,
`components/goals/board/goal-table-view.tsx`,
`components/hr/candidate/invite-candidate-dialog.tsx`,
`components/hr/letters/letter-editor.tsx`,
`components/incentive/incentive-entries.tsx`,
`components/incentive/incentive-targets.tsx`,
`components/layout/main-nav.tsx`, `components/project-plan/plan-board.tsx`,
`components/project-plan/plan-status-cell.tsx`,
`components/tasks/task-table.tsx`, `db/schema.ts`,
`lib/attendance/confirmations.ts`, `lib/permissions/catalog.ts`,
`lib/project-plan/status.ts`, `lib/queries/tasks.ts`, `lib/types.ts`,
`package.json`, `scripts/dummy-db-seed.ts`.

### 5d. To pick it up again

```bash
git switch Shreya          # already there; tree is clean at 63407627
git merge wms/main         # same 23 conflicts, reproducibly
# ... resolve, with the status-architecture decision made first ...
git merge --abort          # any time; 63407627 is the fallback
```

Settle the status-axes question before touching anything else — a dozen of the
twenty follow from it.

---

## How to update this file

Append to §2 as you go, in the same register as the rest: what changed, and the
reason it changed. A line that says only what changed is half a handoff — the
next person needs to know which constraint you were under, because that is what
tells them whether it still applies.
