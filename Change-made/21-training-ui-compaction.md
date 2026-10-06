# 21 — Training UI Compaction

**Date:** 26 September 2026
**Migration:** None
**Scope:** Training UI presentation only

---

## What changed

Training page chrome now follows the compact WMS/Accounts command-bar pattern.
The Training layout removes decorative page-title pills and subtitle blocks,
then normalises remaining Training title size and spacing.

### Calendar

- Replaced the title block with `PageCommandBar`.
- Kept List, Day, Week, and Month controls unchanged.
- Reduced the no-schedule alert to one compact status row.

### Self-Learning

- Moved Monthly Progress and Log an Entry into a two-column desktop layout.
- Kept the mobile and tablet stack at the `max-lg` breakpoint.
- Moved This Month's Learning below the two-column area.
- Reduced form, entry-list, and empty-state spacing only.

### Share & Learn

- Replaced the title block with `PageCommandBar`.
- Converted Recent Colleague Shares from a two-column card grid to one compact,
  separated vertical list.
- Kept ratings, feedback, video links, notes, and submit actions intact.

### Obligations

- Replaced the title block with `PageCommandBar`.
- Reworked summary cards into one compact summary strip.
- Replaced two-column roster cards with full-width chunky list rows.
- Preserved each progress metric and added a presentation-only row status.

## Files

- `app/(app)/training/layout.tsx`
- `app/(app)/training/calendar/page.tsx`
- `app/(app)/training/self-learning/page.tsx`
- `app/(app)/training/share/page.tsx`
- `app/(app)/training/obligations/page.tsx`
- `components/training/learning/self-learning-form.tsx`
- `components/training/learning/share-feed.tsx`

## Verification

- `pnpm.cmd typecheck` passed.
- Targeted ESLint passed.
- `pnpm.cmd build` passed before the later Drop Down Master work.

## Intentionally unchanged

- Training data, calculations, schedules, attendance, feedback, assessments,
  permissions, APIs, server actions, and database schema.
