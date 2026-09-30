# Upload Master central template configuration

Date: 2026-09-30
Branch: Om
Status: In progress; do not push or deploy yet.

## Objective

Make Upload Master the central registry for the 16 downloadable structured-data templates, while preserving the existing override-first resolver. Persist required-field choices per template variant so generated workbooks and server parsers can use the same setting.

## Implemented

- Added the eight audited registry keys: WCC, MCC, Checklist, Job Description, Vendor Directory, Incentive Entries, Outstanding, and Collection.
- Added registry metadata for modules, destinations, supported fields, and isolated contexts (project kinds, checklist run/master/event, JD generic/person, and Accounts sheets).
- Added `template_field_configs` schema and migration `0256_template_field_configs.sql`.
- Added the Upload Master mandatory-field editor and persistence action. Static template overrides remain untouched and continue to win before any generated template is built.
- Extended resolver coverage for every registered key and made generated headers use the existing trailing `*` convention.
- Routed Checklist and JD template buttons through the central download route. WCC/MCC, Incentive, and Outstanding/Collection direct template paths resolve the saved required-field configuration.
- Added initial server-side custom-required-field checks for Tasks and Incentive imports.

## Database impact

Migration `db/migrations/0256_template_field_configs.sql` adds a configuration table keyed by `(key, variant)`. It is forward-only and has not been applied in this workspace. No existing data or override files are changed.

## Authorization

The editor uses existing Upload Master admin/module-edit checks. Existing importer and download permissions are retained. No new role or permission is introduced.

## Remaining work

- Complete server-side required-field policy enforcement for Goals, Weekly Goals, Projects, Accounts, Compliance, Checklist, JD, Vendor, and Billing imports. The saved configuration currently drives generated header markings for those flows, but not all parser validation paths yet.
- Add focused tests for saved configuration resolution and each variant; current registry tests need to finish successfully with the added runtime builders.
- Run lint/typecheck to completion, inspect the final diff for scope/secrets, and test against a migrated local database.
- Do not apply the migration, push, or deploy without the task owner’s next instruction.

## Rollback

Revert this work item’s commit(s). Removing the configuration table is not required for application rollback because no existing flow depends on it before the new code is enabled.
