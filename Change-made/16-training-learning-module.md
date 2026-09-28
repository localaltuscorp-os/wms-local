# 16 — Training & Learning (LMS) module

**Date:** 23 September 2026
**Migration:** `db/migrations/0248_training_learning.sql` + `0249_share_self_learning_link.sql` + `0250_training_lookups.sql` — **all applied 2026-09-23**
**SQL for another database:** [`SQL/15-apply-training-learning.sql`](./SQL/15-apply-training-learning.sql),
verified by [`SQL/16-verify-training-learning.sql`](./SQL/16-verify-training-learning.sql)
**Written for:** anyone, including people who did not build this.

---

## What this is

A Learning & Development module built **by extending the existing Training Centre**,
not as a parallel LMS. The Training Centre already owned the material library, test
engine, session calendar, attendance, feedback CRM, self-learning and weekly shares.
This change adds the missing LMS semantics on top of those tables and adds six new
entities, so the result feels like it was always part of Altus Corp OS.

No employee master, reporting hierarchy, schedule, notification, storage or audit
system is duplicated. Each is reused.

---

## What changed

1. **Schema (migration 0248)** — extended four `tc_*` tables, added six new tables.
2. **Enums** — seven new value sets + label maps in `db/enums.ts`.
3. **Permissions** — a `training` catalogue node grew six children; a new
   `lib/training/roles.ts` carries the trainer/visibility predicates.
4. **Server actions** — scheduling/audience/recurrence/lifecycle/join/watch-progress,
   anonymous surveys, learning-target config, daily share schedule, self-learning
   office-hours validation.
5. **Queries** — targets, surveys, share schedule, analytics.
6. **Pages** — six new pages plus upgrades to the calendar, share, dashboard,
   self-learning and survey surfaces.
7. **Notifications** — eleven new kinds wired through every channel template map.

---

## 1. Schema — migration `0248`

All additive and idempotent. No existing column or row is touched.

### Extended tables

| Table | New columns |
|---|---|
| `tc_sessions` | `function_id` (FK `functions`), `training_type`, `audience_scope`, `recurrence_rule`, `recurrence_parent_id`, `recurrence_occurrence_date` |
| `tc_session_attendees` | `required` (required vs optional), `join_time` (self check-in) |
| `tc_watch_progress` | `video_duration_sec`, `watched_sec`, `last_position_sec` (was a boolean) |
| `tc_self_learning` | `source`, `start_time`, `end_time`, `function_id` |

The recurrence columns mirror the Tasks module exactly (`tasks.recurrence_rule` /
`recurrence_parent_id` / `recurrence_occurrence_date`), so `tc_sessions` reuses the
same "single materialized occurrence ahead" model.

### New tables

- `tc_training_surveys` — one anonymous 1–5 survey per training session.
- `tc_survey_questions` — the survey's questions.
- `tc_survey_responses` — a response. `employee_id` is stored for dedup/uniqueness
  but **never selected by the trainer-facing aggregate**; anonymity is enforced at
  the read boundary.
- `tc_learning_targets` — per-role target with `effective_from` / `effective_to`,
  so changing a future target never rewrites a past month.
- `tc_share_schedule` — the daily learning-share rotation (`share_date`, `slot`
  junior/tl, `presenter_id`, `status`, `replaced_by_id`).
- `tc_share_attendees` — who attended a share.

## 2. Enums (`db/enums.ts`)

`TRAINING_STATUSES` (draft → scheduled → live → done/completed → test_pending →
feedback_pending → closed, plus cancelled/rescheduled), `TRAINING_TYPES`,
`AUDIENCE_SCOPES` (my_team / another_team / multiple_teams / function /
selected_employees / everyone), `TRAINING_ATTENDANCE_STATUSES`,
`SELF_LEARNING_SOURCES`, `LEARNING_ROLE_GROUPS`, `LEARNING_METRICS`, `SHARE_SLOTS`.
Each has a `*_LABELS` map. All stored as `text` (no `pgEnum`), matching the
codebase's newer convention so a new value never needs an `ALTER TYPE`.

## 3. Permissions — `lib/training/roles.ts`

- `canTrain(emp)` — a trainer is a Team Lead (`isTeamLead`), a manager (has a
  downline) or Manan (`isFounderEmail`). Independent of the reporting hierarchy,
  per spec §38: TL B may train Employee A who reports to TL A.
- `canManageTraining(emp)` — trainers + admins/supers.
- `learningRoleGroupFor(emp)` — employee / tl / manager / manan, derived from the
  existing flags, never a stored role.
- `learningVisibleIds(viewer)` — self + `getDownlineIds` (the shared recursive-CTE
  primitive). Admins/Manan return `[]` = no restriction.

The permission catalogue (`lib/permissions/catalog.ts`) `training` node gained:
`training.schedule`, `training.attendance`, `training.surveys`, `training.targets`,
`training.analytics`, `training.configuration`.

## 4. Server actions + queries

- `app/(app)/training/calendar/actions.ts` — `createSession`/`updateSession` now
  take `functionId`, `trainingType`, `audienceScope`, `recurrenceRule`, and split
  required vs optional attendees. New: `transitionSession` (validated lifecycle),
  `joinSession` (self check-in), `recordWatchProgress` (per-second). `cancelSession`
  now notifies attendees and audits. Attendance statuses widened.
- `app/(app)/training/surveys/actions.ts` — `upsertSurvey`, `submitSurveyResponse`
  (anonymous; only attendees may respond).
- `app/(app)/training/configuration/actions.ts` — `upsertLearningTarget` (closes the
  prior open row the day before), `retireLearningTarget`.
- `app/(app)/training/share/schedule-actions.ts` — `scheduleShare`, `recordShare`,
  `replaceShare`, `setShareAttendance`.
- `app/(app)/training/self-learning/actions.ts` — `source`/`start_time`/`end_time`/
  `function_id`, evidence relaxed to optional, and `overlapWithOfficeMinutes`
  (midnight-safe) returns the overlap in the result.
- Queries: `lib/queries/learning-targets.ts`, `lib/queries/surveys.ts`,
  `lib/queries/share-schedule.ts`, `lib/queries/learning-analytics.ts`.

Recurrence materialization: `lib/training/recurrence.ts` +
`app/api/cron/training-recurrence/route.ts` (CRON_SECRET-authed, idempotent,
14-day forward window).

## 5. Pages

New:
- `/training/schedule` — full scheduler (audience selector, training type, function,
  recurrence, required/optional attendees, LOS required).
- `/training/attendance` — attendance list + `.xlsx` export
  (`app/(app)/training/attendance/export.xlsx/route.ts`).
- `/training/surveys` + `/training/surveys/[id]` — author + fill, aggregate-only.
- `/training/targets` — person-wise target vs actual + TL-group summary.
- `/training/analytics` — function/topic/trainer/attendance/score aggregates.
- `/training/configuration` — admin target editor.

Upgraded: `/training/dashboard` (role-aware "My Learning" KPI cards + team overview),
`/training/share` (daily schedule board), the session detail page (join button +
lifecycle buttons), the material viewer (per-second watch-progress bar).

## 6. Notifications

Eleven new kinds appended to `NOTIFICATION_KINDS`:
`training_scheduled`, `training_rescheduled`, `training_cancelled`,
`training_recording_ready`, `training_recording_incomplete`, `training_test_pending`,
`training_feedback_pending`, `learning_share_scheduled`, `learning_share_reminder`,
`learning_target_approaching`, `learning_target_incomplete`.

All five exhaustive `Record<NotificationKind, …>` maps were extended to match:
`lib/notifications/categories.ts`, `components/admin/settings-tab-notifications.tsx`,
`lib/slack/templates.ts`, `lib/web-push/payload.ts`, `lib/whatsapp/templates.ts`.

---

## Verification

```
pnpm typecheck (tsc --noEmit, excluding stale .next/types)   clean
route-handler-coverage: new export route guarded + owned      clean
permission-catalog: all 6 new training routes resolve         clean
```

## Known pre-existing test failures (not caused by this work)

- `permission-catalog`: `/events/{obligations,calendar,masters,batches}` pages
  missing; `nodeKeyForPath("/api/hr/letters/*")` returns `null` (test expects
  `hr.letters`).
- `route-handler-coverage`: "guarded but unowned" API handlers (`hr/letters`,
  `training/upload`, etc.).
- `operations-room`: `workspaceForPath("/projects")` returns `"wms"`.

None touch the Training & Learning module.

## 7. Calendar — grid views (build pass 2)

`components/training/calendar/calendar-grid.tsx` renders three real grid views
over the sessions list, selectable from the calendar header:

- **Month** — a 7-column, 6-week grid with a chip per session (up to two, then
  "+N"), today ringed, out-of-month days dimmed.
- **Week** — seven day columns with time-ordered chips.
- **Day** — a time-ordered list with trainer, duration, mode and attendance.

All three navigate with Prev / Today / Next. Dates and times are resolved in
`Asia/Kolkata` (the same `TZ` the rest of the module uses), so a session is never
shown on the wrong IST day. The grid receives the FULL session list and does its
own windowing; the existing board remains the default **List** view.

## 8. Writable master data — migration `0250`

`tc_lookups` (kind, value, label, is_active, sort_order) makes four lists real
master data an admin can edit, following the same shape the module already uses
for `tc_subjects` / `tc_services`:

| Kind | Seeded |
|---|---|
| `training_type` | Technical, Soft Skills, Product, Process, Compliance, Induction, Other |
| `audience_scope` | My Team, Another Team, Multiple Teams, Function, Selected Employees, Everyone |
| `share_slot` | Juniors (1:30 PM), Team Leads (1:40 PM) |
| `self_learning_source` | YouTube, Course, Book, Article, Documentation, Podcast, AI, Certification, Workshop, Internal Material, Other |

The configuration page (Admin) can add, rename, reorder, retire and restore each
option. Retiring is SOFT — historical rows keep the value; only the pickers drop
it. The enum arrays in `db/enums.ts` remain the SEED and the FALLBACK, so an
empty or fully-retired table still leaves the app with a usable list
(`lib/queries/training-lookups.ts` → `lookupOptions`).

**Verified after apply:** `tc_lookups` holds 26 rows (7 + 6 + 2 + 11), and
`self_learning_id` is present on both `tc_shares` and `tc_share_schedule`.

## What is intentionally out of scope

Nothing from the LMS brief remains unbuilt. Two deliberate simplifications:

- The calendar grid is a read/navigate surface over the same sessions the board
  lists; drag-to-reschedule is not implemented (edit the session to move it).
- Master data is edited as flat lists (no per-function topic mapping beyond
  `tc_subjects`, which already exists).
