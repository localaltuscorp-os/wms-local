# SQL handed over with the fork push — 21 Sep 2026

Everything SQL that landed on `wms-local` main between the previous fork
push (`9d1523e0`, 11 Sep) and this one (`e841a05d`, 19 Sep 16:25).
Shreya's branch is NOT included — it is unmerged.

## How to apply

Use the combined file — it is ordered, de-duplicated and tested end to end:

1. `bundles/RUN-IN-SUPABASE-SINCE-FORK-0911.sql` (PART 1, then PART 2, then PART 3)
2. `bundles/VERIFY-SINCE-FORK-0911.sql` — 126 checks, every row must say PASS

`migrations/` holds the same changes as the individual files, in case you want
to read or apply them one at a time. The other files in `bundles/` are the
partial bundles used on the way here, kept for reference.

**`0223_clear_registered_devices.sql` is `DELETE FROM mobile_devices`** — a
one-time wipe that already ran on 17 Sep. It is in `migrations/` for the
record and is deliberately NOT in the combined bundle. Do not run it.

## Migrations (51)

| File | Came with | When | Who |
|---|---|---|---|
| `0215_broadcast_popup_snooze.sql` | 5e3d2fd6 | 10 Sep 19:48 | Rudra |
| `0215_device_access_and_attendance_audit.sql` | 9963b8d4 | 09 Sep 20:44 | OMJ |
| `0216_incentive_eligibility.sql` | 7e91012a | 15 Sep 12:00 | Rakesh Dubey |
| `0216_module_submission_attachments.sql` | d0c2a3a3 | 10 Sep 19:47 | OMJ |
| `0217_masters_payment_modes_and_products.sql` | d0c2a3a3 | 10 Sep 19:47 | OMJ |
| `0218_delegated_access.sql` | d0c2a3a3 | 10 Sep 19:47 | OMJ |
| `0219_permission_matrix.sql` | d0c2a3a3 | 10 Sep 19:47 | OMJ |
| `0220_manager_hierarchy_history.sql` | d0c2a3a3 | 10 Sep 19:47 | OMJ |
| `0221_candidate_access_links.sql` | f2abd897 | 11 Sep 19:30 | Rudra |
| `0221_holiday_note.sql` | 3debc41f | 11 Sep 19:18 | OMJ |
| `0221_operations_checklist.sql` | 46fcc452 | 11 Sep 19:32 | MananVasa-support |
| `0222_candidate_policy_signing.sql` | f2abd897 | 11 Sep 19:30 | Rudra |
| `0222_device_registration_consent.sql` | 3debc41f | 11 Sep 19:18 | OMJ |
| `0222_job_description.sql` | 703aec68 | 11 Sep 19:33 | MananVasa-support |
| `0223_clear_registered_devices.sql` | 3debc41f | 11 Sep 19:18 | OMJ |
| `0224_device_name_replaces_bios_serial.sql` | 3debc41f | 11 Sep 19:18 | OMJ |
| `0225_candidate_intake_merge.sql` | 88c2a053 | 18 Sep 13:10 | Rakesh Dubey |
| `0225_candidate_policy_signature_image.sql` | 43b4bba0 | 13 Sep 05:39 | Rudra |
| `0225_employee_master.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |
| `0225_hr_records_drive.sql` | a1861cbb | 16 Sep 11:45 | localaltuscorp-os |
| `0225_jd_assignment_targets.sql` | 45c0b275 | 12 Sep 18:50 | MananVasa-support |
| `0226_billing_master.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |
| `0226_capability_grants.sql` | 88c2a053 | 18 Sep 13:10 | Rakesh Dubey |
| `0226_employee_policy_typed_signatures.sql` | 43b4bba0 | 13 Sep 05:39 | Rudra |
| `0226_jd_rank_ladder_26.sql` | 45c0b275 | 12 Sep 18:50 | MananVasa-support |
| `0227_entity_code_prefixes.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |
| `0227_permission_node_settings.sql` | 88c2a053 | 18 Sep 13:10 | Rakesh Dubey |
| `0228_employee_schedule_settings.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |
| `0228_jd_entries_category.sql` | 71bdb87b | 15 Sep 18:50 | MananVasa-support |
| `0228_letter_issue_capability.sql` | a405f56c | 18 Sep 17:34 | Rakesh Dubey |
| `0229_dcc_calendar_events.sql` | 71bdb87b | 15 Sep 18:50 | MananVasa-support |
| `0229_incentive_request_split.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |
| `0230_dcc_master_items.sql` | 71bdb87b | 15 Sep 18:50 | MananVasa-support |
| `0230_incentive_approval_workflow.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |
| `0231_approver_initiator_status.sql` | 71bdb87b | 15 Sep 18:50 | MananVasa-support |
| `0231_incentive_notifications.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |
| `0232_incentive_master.sql` | bd28dfda | 17 Sep 13:53 | OMJ |
| `0232_recruitment_jds.sql` | 71bdb87b | 15 Sep 18:50 | MananVasa-support |
| `0233_jd_person_specific.sql` | 71bdb87b | 15 Sep 18:50 | MananVasa-support |
| `0234_functions_replace_departments.sql` | 43ae5d96 | 17 Sep 13:55 | OMJ |
| `0234_initiator_status_archived.sql` | f7c7bc42 | 16 Sep 22:47 | MananVasa-support |
| `0235_dcc_call_logs.sql` | f7c7bc42 | 16 Sep 22:47 | MananVasa-support |
| `0236_recruitment_jd_roles.sql` | ffc8406a | 17 Sep 20:10 | MananVasa-support |
| `0237_account_lockouts.sql` | 4c838feb | 18 Sep 11:50 | localaltuscorp-os |
| `0237_checklist_wms_columns_jd_client.sql` | a416c839 | 18 Sep 20:16 | MananVasa-support |
| `0238_security_role_grants.sql` | 70b199ca | 18 Sep 12:23 | localaltuscorp-os |
| `0238_wcc_mcc.sql` | a416c839 | 18 Sep 20:16 | MananVasa-support |
| `0240_incentive_entry_reversal.sql` | bd28dfda | 17 Sep 13:53 | OMJ |
| `0241_template_files.sql` | 4259de0e | 17 Sep 19:21 | OMJ |
| `0242_two_step_verification.sql` | 05ccb52e | 19 Sep 12:10 | localaltuscorp-os |
| `0243_device_per_person.sql` | 2ebc6c6d | 19 Sep 17:30 | localaltuscorp-os |

## Bundles and helper SQL (21)

| File | Came with | When | Who |
|---|---|---|---|
| `DIAGNOSE-FUNCTIONS-REFERENCE.sql` | 1fd5aef2 | 19 Sep 13:10 | localaltuscorp-os |
| `ENABLE-REALTIME-BROADCASTS.sql` | d449cd43 | 15 Sep 19:16 | Rakesh Dubey |
| `PREFLIGHT-0225-0226-0237-0238.sql` | 864255cf | 19 Sep 11:26 | localaltuscorp-os |
| `PREFLIGHT-OM-0225-0241.sql` | b68d5177 | 19 Sep 12:56 | localaltuscorp-os |
| `RESTORE-DEVICES-FROM-0223-BACKUP.sql` | fd146342 | 15 Sep 17:16 | Rakesh Dubey |
| `RUN-IN-SUPABASE-0215-0224-ALL.sql` | eb83766b | 15 Sep 11:36 | localaltuscorp-os |
| `RUN-IN-SUPABASE-0216-0224.sql` | 6ee2de48 | 11 Sep 19:27 | OMJ |
| `RUN-IN-SUPABASE-0221-0222.sql` | 703aec68 | 11 Sep 19:33 | MananVasa-support |
| `RUN-IN-SUPABASE-0225-0226-0237-0238.sql` | 864255cf | 19 Sep 11:26 | localaltuscorp-os |
| `RUN-IN-SUPABASE-0228-0233.sql` | 71bdb87b | 15 Sep 18:50 | MananVasa-support |
| `RUN-IN-SUPABASE-0237-0238.sql` | a416c839 | 18 Sep 20:16 | MananVasa-support |
| `RUN-IN-SUPABASE-MAIN-MISSING-0204-0236.sql` | bc80ebd9 | 18 Sep 10:59 | localaltuscorp-os |
| `RUN-IN-SUPABASE-OM-0225-0241.sql` | b68d5177 | 19 Sep 12:56 | localaltuscorp-os |
| `RUN-IN-SUPABASE-SINCE-FORK-0911.sql` | 390b98a9 | 21 Sep 11:09 | localaltuscorp-os |
| `SEED-CLIENTS-AND-SUBJECTS.sql` | 4ad12304 | 15 Sep 18:25 | Rakesh Dubey |
| `VERIFY-0215-0224.sql` | eb83766b | 15 Sep 11:36 | localaltuscorp-os |
| `VERIFY-0225-0226-0237-0238.sql` | 864255cf | 19 Sep 11:26 | localaltuscorp-os |
| `VERIFY-MAIN-MISSING-0204-0236.sql` | bc80ebd9 | 18 Sep 10:59 | localaltuscorp-os |
| `VERIFY-OM-0225-0241.sql` | b68d5177 | 19 Sep 12:56 | localaltuscorp-os |
| `VERIFY-SINCE-FORK-0911.sql` | 390b98a9 | 21 Sep 11:09 | localaltuscorp-os |
| `incentive-production.sql` | 96cca2c7 | 16 Sep 10:59 | OMJ |

## Not copied (6) — history and superseded material

- `Change-made/SQL/01-apply-production.sql` (29d87c12, 17 Sep 13:51)
- `Change-made/SQL/02-verify-production.sql` (29d87c12, 17 Sep 13:51)
- `Change-made/SQL/03-apply-upload-master.sql` (4259de0e, 17 Sep 19:21)
- `Change-made/SQL/04-verify-upload-master.sql` (4259de0e, 17 Sep 19:21)
- `db/history/SCHEMA_DRIFT_FIX_2026-09-10.sql` (1813812c, 15 Sep 16:51)
- `docs/SCHEMA_DRIFT_FIX_2026-09-10.sql` (5e74da92, 17 Sep 18:34)
