# HANDOFF — `Vinal` branch

**Updated:** 2026-09-15
**Repo:** `https://github.com/localaltuscorp-os/wms-local` · branch `Vinal`
**Audience:** team, lead, and whoever runs the SQL in Supabase.

---

## 1. Run this SQL in Supabase

### Combined migration sheet for today's work:

**`db/RUN-IN-SUPABASE-0228-0233.sql`** — every pending migration created today (`0228` through `0233`), in order.

Supabase Dashboard → SQL Editor → New query → paste the file → Run. Or:

```bash
psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-0228-0233.sql
```

All 6 migrations are fully **idempotent** (`if not exists` / `if exists`), safe to re-run.

---

## 2. Work Delivered Today (2026-09-15)

### 1. Job Description Category Field & Person-Specific JDs
- **What changed**: Added `category` column to `jd_entries` (`0228`) and `owner_employee_id` with XOR check constraint (`0233`). Created person view tab and bulk CSV uploader.
- **Why**: Allows job description items to be tagged by free-text categories (e.g. Vendors, Housekeeping) and assigned directly to a specific person in addition to position seats.
- **SQL**: `db/migrations/0228_jd_entries_category.sql`, `db/migrations/0233_jd_person_specific.sql`.

### 2. DCC Masters (Position Templates & Live Link Sync)
- **What changed**: Created `dcc_master_items` & `dcc_master_links` (`0230`). Added `/dcc/masters` administration interface and automatic sync engine (`lib/dcc/master-sync.ts`).
- **Why**: Enables defining a master Daily Compliance checklist per designation/position that automatically populates and updates active employee KPIs while preserving historical entries.
- **SQL**: `db/migrations/0230_dcc_master_items.sql`.

### 3. DCC Dashboard, Detailed Breakdown & 10 PM Daily Automated Report
- **What changed**: Created `/dcc/dashboard` with completion statistics, department filters, entry lock status, and cron endpoint `/api/cron/dcc-daily-report` for daily email digests.
- **Why**: Gives management visibility into daily compliance across departments and sends nightly summary emails to leaders.
- **SQL**: Uses `0230` master tables and existing DCC entry tables.

### 4. DCC Google Calendar Sync & Connect Gate
- **What changed**: Created `dcc_calendar_events` (`0229`) and Google Calendar sync service (`lib/dcc/calendar-sync.ts`, `/api/cron/dcc-calendar-sync`). Added Calendar Connect Gate component.
- **Why**: Keeps each employee's daily compliance tasks visible directly as an all-day event in their Altus Google Calendar without duplicate events.
- **SQL**: `db/migrations/0229_dcc_calendar_events.sql`.

### 5. Approver / Initiator Status (Doer Status vs Approver Ruling)
- **What changed**: Added `on_hold` value to `approval_status` enum, and created `goal_approver_statuses` & `weekly_goal_approver_statuses` tables (`0231`). Updated WMS tasks, Goals, and Weekly Goals boards to present independent Doer Status and Approver/Initiator Status rulings.
- **Why**: Separates the doer's execution status (e.g. Not Started, Initiated, Done) from the approver/initiator's ruling (Pending, Approved, Not Approved, On Hold, Cancelled).
- **SQL**: `db/migrations/0231_approver_initiator_status.sql`.

### 6. Recruitment JDs (HR Candidate Job Descriptions & WhatsApp / Email Sends)
- **What changed**: Created `recruitment_jds` & `recruitment_jd_sends` (`0232`), added `/hr/recruitment-jd` management hub and recruiter share modal with WhatsApp deep link formatting and email delivery.
- **Why**: Allows HR recruiters to view master candidate job descriptions, customize recruiter copies, and send formatted job overviews directly to applicants.
- **SQL**: `db/migrations/0232_recruitment_jds.sql`.

### 7. Hand-Holding (HH) Week Calendar & Auto-Linking
- **What changed**: Created HH Week Calendar view component and server actions (`app/(app)/people-allocation/calendar-actions.ts`, `components/people-allocation/hh-week-calendar.tsx`, `lib/hh/auto-link.ts`).
- **Why**: Provides a week-by-week visual schedule for hand-holding allocations and automatically links team allocations to calendar events.
- **SQL**: None.

### 8. Operations & Event Masters Navigation
- **What changed**: Added masters administration routes for Operations (`/operations/masters`) and Events (`/events/masters`).
- **Why**: Provides central administration for category options and checklist master items.
- **SQL**: None.
