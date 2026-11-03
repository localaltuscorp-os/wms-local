# Cron mail kill-switch (local-only)

- **Date:** 2026-11-03
- **Branch:** `feature/cron-mail-off`
- **Status:** Ready for review. Not yet verified at runtime.

## Objective

Let a developer stop the cron jobs that email people, on their own machine only,
without changing behaviour for any deployed environment.

## Summary

- New helper `lib/cron/mail-switch.ts`. `isCronMailOff()` is true only when the
  environment variable `CRON_MAIL_OFF` is `on` (case-insensitive). The variable is
  read from the environment and is not set in code.
- Each of the 17 mail-sending cron routes returns
  `{ ok: true, skipped: "cron_mail_off" }` at the top of its `GET` and `POST`
  handlers when the switch is on. Nothing else in those routes changes.
- Routes: `attendance-confirm-reminder`, `attendance-monthly`,
  `attendance-weekly-rollup`, `attendance-weekly`, `compliance-reminders`,
  `dcc-daily-report`, `digest`, `ecos-reminders`, `goals-sunday-report`, `hr-sla`,
  `incentive-digest`, `incentive-weekly-report`, `monthly-slips`, `pms-quarterly`,
  `retry-dispatch`, `task-reminders`, `weekly-goals`.

## Files changed

- `lib/cron/mail-switch.ts` (new)
- `app/api/cron/*/route.ts` for the 17 routes above

## Database and migrations

None.

## Security and access

None. The switch can only stop sends; it does not change authentication or
authorization. The guard runs before the handler's own `CRON_SECRET` check, so an
unauthenticated caller gets the skip response instead of a 401 while the switch is
on.

## Testing

- `tsc --noEmit` on the branch reports one error: `nodemailer` not found in the
  local `node_modules`. That dependency is in `origin/main` but not in the local
  install. No error comes from the changed files.
- Not run: unit tests, `pnpm build`, `pnpm check:leaks`, and any live cron call.

## Behaviour to know

- While the switch is on, the whole route is skipped. Routes that also write
  in-app notifications or retry queues (`digest`, `task-reminders`, `retry-dispatch`)
  stop those writes too.
- Emails sent from user actions (sign-in codes, task notifications) are not cron
  jobs and are not affected.

## Deployment and rollback

- Deployments that do not define `CRON_MAIL_OFF` keep sending. Confirm that the
  Vercel project for `wms-local` main does not set it.
- Rollback: revert the commit, or unset `CRON_MAIL_OFF` locally.

## Remaining work

- Confirm the switch skips sends on a local run.
- Decide whether to gate only the send calls, so in-app notifications still write.
