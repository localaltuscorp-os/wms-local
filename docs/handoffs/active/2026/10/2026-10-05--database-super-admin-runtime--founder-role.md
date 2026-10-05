# Database-backed Founder role

Date: 2026-10-05
Branch: `bugfix/database-super-admin-runtime`

## Outcome

- Founder authority is an enforced `founder` entry in the existing audited `security_role_grants` system.
- Runtime authorization identifies the Founder by employee ID and database grant, never by name or email.
- The connected database was backfilled transactionally from the previous runtime holder; one grant and one audit event were created.
- The Super Admin hidden-role panel can manage future Founder assignment changes through the existing role workflow.

## Affected behaviour

- Founder-only task approval and send-back.
- Training scope and learning targets.
- Incentive review and scheme editing.
- Reporting hierarchy root protection and manager assignment.
- Initiator/delegation dashboards and drill-downs.
- Compliance and weekly attendance scheduled reports.

## Validation

- `pnpm typecheck` passed with the repository CI heap setting.
- Full unit suite passed: 396 files, 5,311 tests; 5 files and 34 tests skipped by the suite.
- `pnpm check:leaks` passed.
- Focused Founder/approval/incentive suite passed: 94 tests.

## Rollback

Revert the application commit to restore the former authorization logic. Do not remove the database grant or audit event during an application rollback; they are inert to older code and preserve the authorization history.
