-- VERIFY — fork delivery of 23 September 2026
-- READ-ONLY. Run before applying and again after; every value must be TRUE/NON-NULL.
-- Project: mwaijzxuyicisvimzspx is NOT this one — ours is mwaijzxuyicysvimzspx.
-- Generated from the migration files themselves: every table they CREATE is checked.

with cols as (select table_name, column_name from information_schema.columns where table_schema='public')
select
  to_regclass('public.hr_asset_counters') is not null as t01_hr_asset_counters,
  to_regclass('public.hr_assets') is not null as t02_hr_assets,
  to_regclass('public.hr_contacts') is not null as t03_hr_contacts,
  to_regclass('public.ops_vendors') is not null as t04_ops_vendors,
  to_regclass('public.billing_customers') is not null as t05_billing_customers,
  to_regclass('public.billing_document_events') is not null as t06_billing_document_events,
  to_regclass('public.billing_document_lines') is not null as t07_billing_document_lines,
  to_regclass('public.billing_documents') is not null as t08_billing_documents,
  to_regclass('public.billing_email_log') is not null as t09_billing_email_log,
  to_regclass('public.billing_entity_profiles') is not null as t10_billing_entity_profiles,
  to_regclass('public.billing_number_series') is not null as t11_billing_number_series,
  to_regclass('public.billing_payment_terms') is not null as t12_billing_payment_terms,
  to_regclass('public.billing_sac_codes') is not null as t13_billing_sac_codes,
  to_regclass('public.billing_series_defaults') is not null as t14_billing_series_defaults,
  to_regclass('public.ce_dropdown_options') is not null as t15_ce_dropdown_options,
  to_regclass('public.pa_assignment_events') is not null as t16_pa_assignment_events,
  to_regclass('public.exec_calendar_events') is not null as t17_exec_calendar_events,
  to_regclass('public.exec_calendar_prefs') is not null as t18_exec_calendar_prefs,
  to_regclass('public.exec_calendar_routines') is not null as t19_exec_calendar_routines,
  to_regclass('public.billing_customer_addresses') is not null as t20_billing_customer_addresses,
  to_regclass('public.billing_customer_contacts') is not null as t21_billing_customer_contacts,
  to_regclass('public.billing_customer_documents') is not null as t22_billing_customer_documents,
  to_regclass('public.billing_lookups') is not null as t23_billing_lookups,
  to_regclass('public.billing_contract_items') is not null as t24_billing_contract_items,
  to_regclass('public.billing_contract_pdcs') is not null as t25_billing_contract_pdcs,
  to_regclass('public.billing_contracts') is not null as t26_billing_contracts,
  to_regclass('public.exec_calendar_day_markers') is not null as t27_exec_calendar_day_markers,
  to_regclass('public.ce_accounts') is not null as t28_ce_accounts,
  to_regclass('public.ce_audit_log') is not null as t29_ce_audit_log,
  to_regclass('public.ce_engagements') is not null as t30_ce_engagements,
  to_regclass('public.ce_references') is not null as t31_ce_references,
  to_regclass('public.ce_team_members') is not null as t32_ce_team_members,
  to_regclass('public.visibility_grants') is not null as t33_visibility_grants,
  to_regclass('public.incentive_function_scope') is not null as t34_incentive_function_scope,
  to_regclass('public.__schema_applied') is not null as t35___schema_applied,
  to_regclass('public.module_backup_grants') is not null as t36_module_backup_grants,
  to_regclass('public.module_backup_modules') is not null as t37_module_backup_modules,
  to_regclass('public.module_backup_runs') is not null as t38_module_backup_runs,
  to_regclass('public.module_backup_settings') is not null as t39_module_backup_settings,
  to_regclass('public.activity_logs') is not null as t40_activity_logs,
  to_regclass('public.daily_sessions') is not null as t41_daily_sessions,
  to_regclass('public.employee_roles') is not null as t42_employee_roles,
  to_regclass('public.role_permissions') is not null as t43_role_permissions,
  to_regclass('public.roles') is not null as t44_roles,
  true as end_of_file;

-- Anything FALSE above is still missing. Source file for each object:
--   hr_asset_counters  <-  db/migrations/0227_hr_address_book_asset_register.sql
--   hr_assets  <-  db/migrations/0227_hr_address_book_asset_register.sql
--   hr_contacts  <-  db/migrations/0227_hr_address_book_asset_register.sql
--   ops_vendors  <-  db/migrations/0228_ops_vendor_directory.sql
--   billing_customers  <-  db/migrations/0229_billing_documents.sql
--   billing_document_events  <-  db/migrations/0229_billing_documents.sql
--   billing_document_lines  <-  db/migrations/0229_billing_documents.sql
--   billing_documents  <-  db/migrations/0229_billing_documents.sql
--   billing_email_log  <-  db/migrations/0229_billing_documents.sql
--   billing_entity_profiles  <-  db/migrations/0229_billing_documents.sql
--   billing_number_series  <-  db/migrations/0229_billing_documents.sql
--   billing_payment_terms  <-  db/migrations/0229_billing_documents.sql
--   billing_sac_codes  <-  db/migrations/0229_billing_documents.sql
--   billing_series_defaults  <-  db/migrations/0229_billing_documents.sql
--   ce_dropdown_options  <-  db/migrations/0230_client_engagement.sql
--   pa_assignment_events  <-  db/migrations/0230_client_engagement.sql
--   exec_calendar_events  <-  db/migrations/0231_exec_calendar.sql
--   exec_calendar_prefs  <-  db/migrations/0231_exec_calendar.sql
--   exec_calendar_routines  <-  db/migrations/0231_exec_calendar.sql
--   billing_customer_addresses  <-  db/migrations/0233_customer_kyc.sql
--   billing_customer_contacts  <-  db/migrations/0233_customer_kyc.sql
--   billing_customer_documents  <-  db/migrations/0233_customer_kyc.sql
--   billing_lookups  <-  db/migrations/0233_customer_kyc.sql
--   billing_contract_items  <-  db/migrations/0234_billing_contracts.sql
--   billing_contract_pdcs  <-  db/migrations/0234_billing_contracts.sql
--   billing_contracts  <-  db/migrations/0234_billing_contracts.sql
--   exec_calendar_day_markers  <-  db/migrations/0237_exec_calendar_categories_markers.sql
--   ce_accounts  <-  db/migrations/0238_client_engagement_v2.sql
--   ce_audit_log  <-  db/migrations/0238_client_engagement_v2.sql
--   ce_engagements  <-  db/migrations/0238_client_engagement_v2.sql
--   ce_references  <-  db/migrations/0238_client_engagement_v2.sql
--   ce_team_members  <-  db/migrations/0238_client_engagement_v2.sql
--   visibility_grants  <-  db/migrations/0242_visibility_grants.sql
--   incentive_function_scope  <-  db/migrations/0244_incentive_applicability_and_intern_type.sql
--   __schema_applied  <-  db/migrations/0244_module_backup.sql
--   module_backup_grants  <-  db/migrations/0244_module_backup.sql
--   module_backup_modules  <-  db/migrations/0244_module_backup.sql
--   module_backup_runs  <-  db/migrations/0244_module_backup.sql
--   module_backup_settings  <-  db/migrations/0244_module_backup.sql
--   activity_logs  <-  db/migrations/0245_global_logs.sql
--   daily_sessions  <-  db/migrations/0245_global_logs.sql
--   employee_roles  <-  db/migrations/0246_control_panel.sql
--   role_permissions  <-  db/migrations/0246_control_panel.sql
--   roles  <-  db/migrations/0246_control_panel.sql
