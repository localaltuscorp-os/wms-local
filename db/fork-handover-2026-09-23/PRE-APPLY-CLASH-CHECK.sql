-- ════════════════════════════════════════════════════════════════════════════
-- PRE-APPLY CLASH CHECK — READ-ONLY. Run this BEFORE APPLY-2026-09-23.sql.
--
-- WHY THIS EXISTS
--   Every CREATE in this delivery is CREATE TABLE IF NOT EXISTS. On a table
--   that ALREADY exists — from an earlier attempt at the same feature — that
--   statement does nothing at all, old shape and all. The script then reaches
--   a statement naming a column the newer definition has and the older table
--   does not, and stops. That is exactly what happened on 2026-09-23:
--
--     ERROR: 42703: column "outstanding_entity_id" of relation
--     "billing_customers" does not exist
--
--   It is not a bug in the migration. It is a table that was already there.
--
-- HOW TO READ IT
--   Every row printed is a column the delivery expects and your database does
--   not have. An EMPTY RESULT means no clash — go straight to APPLY.
--   Any row means that table needs patching first; the row names the table and
--   the column, and the source file is listed at the bottom of this file.
--
-- Generated from the migration files themselves — 567 columns across
-- every table they create.
-- ════════════════════════════════════════════════════════════════════════════

with needed(table_name, column_name) as (
  values
    ('hr_contacts', 'id'),
    ('hr_contacts', 'company_name'),
    ('hr_contacts', 'person_name'),
    ('hr_contacts', 'cell_no'),
    ('hr_contacts', 'alternate_no'),
    ('hr_contacts', 'email'),
    ('hr_contacts', 'service'),
    ('hr_contacts', 'notes'),
    ('hr_contacts', 'is_active'),
    ('hr_contacts', 'created_by_id'),
    ('hr_contacts', 'updated_by_id'),
    ('hr_contacts', 'created_at'),
    ('hr_contacts', 'updated_at'),
    ('hr_asset_counters', 'prefix'),
    ('hr_asset_counters', 'last'),
    ('hr_assets', 'id'),
    ('hr_assets', 'asset_code'),
    ('hr_assets', 'asset_type'),
    ('hr_assets', 'asset_name'),
    ('hr_assets', 'location'),
    ('hr_assets', 'serial_no'),
    ('hr_assets', 'model'),
    ('hr_assets', 'make'),
    ('hr_assets', 'description'),
    ('hr_assets', 'specifications'),
    ('hr_assets', 'warranty_until'),
    ('hr_assets', 'under_amc'),
    ('hr_assets', 'vendor_name'),
    ('hr_assets', 'photo_path'),
    ('hr_assets', 'invoice_path'),
    ('hr_assets', 'issued_kind'),
    ('hr_assets', 'issued_employee_id'),
    ('hr_assets', 'issued_office'),
    ('hr_assets', 'notes'),
    ('hr_assets', 'username'),
    ('hr_assets', 'password_enc'),
    ('hr_assets', 'created_by_id'),
    ('hr_assets', 'updated_by_id'),
    ('hr_assets', 'created_at'),
    ('hr_assets', 'updated_at'),
    ('ops_vendors', 'id'),
    ('ops_vendors', 'category'),
    ('ops_vendors', 'first_name'),
    ('ops_vendors', 'last_name'),
    ('ops_vendors', 'cell_no'),
    ('ops_vendors', 'email'),
    ('ops_vendors', 'address_line1'),
    ('ops_vendors', 'address_line2'),
    ('ops_vendors', 'address_line3'),
    ('ops_vendors', 'address_line4'),
    ('ops_vendors', 'landmark'),
    ('ops_vendors', 'city'),
    ('ops_vendors', 'state'),
    ('ops_vendors', 'pincode'),
    ('ops_vendors', 'website'),
    ('ops_vendors', 'amc'),
    ('ops_vendors', 'notes'),
    ('ops_vendors', 'is_active'),
    ('ops_vendors', 'created_by_id'),
    ('ops_vendors', 'updated_by_id'),
    ('ops_vendors', 'created_at'),
    ('ops_vendors', 'updated_at'),
    ('billing_payment_terms', 'id'),
    ('billing_payment_terms', 'label'),
    ('billing_payment_terms', 'due_days'),
    ('billing_payment_terms', 'is_default'),
    ('billing_payment_terms', 'is_active'),
    ('billing_payment_terms', 'sort_order'),
    ('billing_payment_terms', 'created_at'),
    ('billing_payment_terms', 'updated_at'),
    ('billing_sac_codes', 'id'),
    ('billing_sac_codes', 'code'),
    ('billing_sac_codes', 'description'),
    ('billing_sac_codes', 'default_gst_rate'),
    ('billing_sac_codes', 'is_active'),
    ('billing_sac_codes', 'sort_order'),
    ('billing_sac_codes', 'created_at'),
    ('billing_sac_codes', 'updated_at'),
    ('billing_entity_profiles', 'id'),
    ('billing_entity_profiles', 'entity_id'),
    ('billing_entity_profiles', 'paying_entity_id'),
    ('billing_entity_profiles', 'legal_name'),
    ('billing_entity_profiles', 'pan'),
    ('billing_entity_profiles', 'gstin'),
    ('billing_entity_profiles', 'state_name'),
    ('billing_entity_profiles', 'state_code'),
    ('billing_entity_profiles', 'address_line'),
    ('billing_entity_profiles', 'email'),
    ('billing_entity_profiles', 'whatsapp'),
    ('billing_entity_profiles', 'phone'),
    ('billing_entity_profiles', 'website'),
    ('billing_entity_profiles', 'logo_url'),
    ('billing_entity_profiles', 'bank_name'),
    ('billing_entity_profiles', 'bank_account_name'),
    ('billing_entity_profiles', 'bank_account_no'),
    ('billing_entity_profiles', 'bank_ifsc'),
    ('billing_entity_profiles', 'bank_branch'),
    ('billing_entity_profiles', 'upi_id'),
    ('billing_entity_profiles', 'default_sac_code'),
    ('billing_entity_profiles', 'signatory_name'),
    ('billing_entity_profiles', 'signatory_designation'),
    ('billing_entity_profiles', 'signature_image_url'),
    ('billing_entity_profiles', 'default_payment_terms_id'),
    ('billing_entity_profiles', 'interest_clause'),
    ('billing_entity_profiles', 'invoice_footer_note'),
    ('billing_entity_profiles', 'is_active'),
    ('billing_entity_profiles', 'created_at'),
    ('billing_entity_profiles', 'updated_at'),
    ('billing_entity_profiles', 'created_by_id'),
    ('billing_entity_profiles', 'updated_by_id'),
    ('billing_customers', 'id'),
    ('billing_customers', 'name'),
    ('billing_customers', 'legal_name'),
    ('billing_customers', 'contact_name'),
    ('billing_customers', 'email'),
    ('billing_customers', 'whatsapp'),
    ('billing_customers', 'phone'),
    ('billing_customers', 'pan'),
    ('billing_customers', 'gstin'),
    ('billing_customers', 'address_line1'),
    ('billing_customers', 'address_line2'),
    ('billing_customers', 'city'),
    ('billing_customers', 'state_name'),
    ('billing_customers', 'state_code'),
    ('billing_customers', 'pincode'),
    ('billing_customers', 'country'),
    ('billing_customers', 'client_id'),
    ('billing_customers', 'outstanding_entity_id'),
    ('billing_customers', 'notes'),
    ('billing_customers', 'is_active'),
    ('billing_customers', 'created_at'),
    ('billing_customers', 'updated_at'),
    ('billing_customers', 'created_by_id'),
    ('billing_customers', 'updated_by_id'),
    ('billing_number_series', 'id'),
    ('billing_number_series', 'entity_id'),
    ('billing_number_series', 'doc_type'),
    ('billing_number_series', 'fin_year'),
    ('billing_number_series', 'prefix'),
    ('billing_number_series', 'next_seq'),
    ('billing_number_series', 'pad_width'),
    ('billing_number_series', 'created_at'),
    ('billing_number_series', 'updated_at'),
    ('billing_series_defaults', 'id'),
    ('billing_series_defaults', 'entity_id'),
    ('billing_series_defaults', 'doc_type'),
    ('billing_series_defaults', 'prefix'),
    ('billing_series_defaults', 'start_seq'),
    ('billing_series_defaults', 'pad_width'),
    ('billing_series_defaults', 'created_at'),
    ('billing_series_defaults', 'updated_at'),
    ('billing_documents', 'id'),
    ('billing_documents', 'doc_type'),
    ('billing_documents', 'doc_no'),
    ('billing_documents', 'fin_year'),
    ('billing_documents', 'seq'),
    ('billing_documents', 'doc_date'),
    ('billing_documents', 'due_date'),
    ('billing_documents', 'status'),
    ('billing_documents', 'entity_id'),
    ('billing_documents', 'entity_profile_id'),
    ('billing_documents', 'seller_snapshot'),
    ('billing_documents', 'customer_id'),
    ('billing_documents', 'customer_snapshot'),
    ('billing_documents', 'customer_name'),
    ('billing_documents', 'customer_contact_name'),
    ('billing_documents', 'customer_email'),
    ('billing_documents', 'customer_whatsapp'),
    ('billing_documents', 'customer_gstin'),
    ('billing_documents', 'place_of_supply_state'),
    ('billing_documents', 'place_of_supply_code'),
    ('billing_documents', 'service_description'),
    ('billing_documents', 'sac_code'),
    ('billing_documents', 'payment_terms_id'),
    ('billing_documents', 'payment_terms_label'),
    ('billing_documents', 'remarks'),
    ('billing_documents', 'gst_mode'),
    ('billing_documents', 'gst_applicable'),
    ('billing_documents', 'is_reverse_charge'),
    ('billing_documents', 'subtotal'),
    ('billing_documents', 'discount_total'),
    ('billing_documents', 'taxable_value'),
    ('billing_documents', 'cgst_amount'),
    ('billing_documents', 'sgst_amount'),
    ('billing_documents', 'igst_amount'),
    ('billing_documents', 'round_off'),
    ('billing_documents', 'total'),
    ('billing_documents', 'amount_in_words'),
    ('billing_documents', 'currency'),
    ('billing_documents', 'source_document_id'),
    ('billing_documents', 'source_doc_no'),
    ('billing_documents', 'source_doc_type'),
    ('billing_documents', 'generated_at'),
    ('billing_documents', 'sent_at'),
    ('billing_documents', 'last_sent_to'),
    ('billing_documents', 'paid_at'),
    ('billing_documents', 'paid_amount'),
    ('billing_documents', 'cancelled_at'),
    ('billing_documents', 'cancel_reason'),
    ('billing_documents', 'pdf_storage_path'),
    ('billing_documents', 'created_at'),
    ('billing_documents', 'updated_at'),
    ('billing_documents', 'created_by_id'),
    ('billing_documents', 'updated_by_id'),
    ('billing_document_lines', 'id'),
    ('billing_document_lines', 'document_id'),
    ('billing_document_lines', 'product_id'),
    ('billing_document_lines', 'code'),
    ('billing_document_lines', 'name'),
    ('billing_document_lines', 'description'),
    ('billing_document_lines', 'sac_code'),
    ('billing_document_lines', 'hsn_code'),
    ('billing_document_lines', 'quantity'),
    ('billing_document_lines', 'unit'),
    ('billing_document_lines', 'rate'),
    ('billing_document_lines', 'discount_pct'),
    ('billing_document_lines', 'discount_amount'),
    ('billing_document_lines', 'amount'),
    ('billing_document_lines', 'gst_rate'),
    ('billing_document_lines', 'cgst_amount'),
    ('billing_document_lines', 'sgst_amount'),
    ('billing_document_lines', 'igst_amount'),
    ('billing_document_lines', 'line_total'),
    ('billing_document_lines', 'sort_order'),
    ('billing_document_lines', 'created_at'),
    ('billing_document_lines', 'updated_at'),
    ('billing_document_events', 'id'),
    ('billing_document_events', 'document_id'),
    ('billing_document_events', 'actor_id'),
    ('billing_document_events', 'event_type'),
    ('billing_document_events', 'meta'),
    ('billing_document_events', 'created_at'),
    ('billing_email_log', 'id'),
    ('billing_email_log', 'document_id'),
    ('billing_email_log', 'recipient'),
    ('billing_email_log', 'cc'),
    ('billing_email_log', 'bcc'),
    ('billing_email_log', 'subject'),
    ('billing_email_log', 'body'),
    ('billing_email_log', 'attachment'),
    ('billing_email_log', 'status'),
    ('billing_email_log', 'error'),
    ('billing_email_log', 'sent_at'),
    ('billing_email_log', 'sent_by_id'),
    ('pa_assignment_events', 'id'),
    ('pa_assignment_events', 'entity_type'),
    ('pa_assignment_events', 'entity_id'),
    ('pa_assignment_events', 'from_person_id'),
    ('pa_assignment_events', 'to_person_id'),
    ('pa_assignment_events', 'actor_id'),
    ('pa_assignment_events', 'created_at'),
    ('ce_dropdown_options', 'id'),
    ('ce_dropdown_options', 'list_key'),
    ('ce_dropdown_options', 'code'),
    ('ce_dropdown_options', 'label'),
    ('ce_dropdown_options', 'sort_order'),
    ('ce_dropdown_options', 'is_active'),
    ('ce_dropdown_options', 'created_by'),
    ('ce_dropdown_options', 'created_at'),
    ('ce_dropdown_options', 'updated_at'),
    ('exec_calendar_events', 'id'),
    ('exec_calendar_events', 'owner_id'),
    ('exec_calendar_events', 'title'),
    ('exec_calendar_events', 'category_key'),
    ('exec_calendar_events', 'event_date'),
    ('exec_calendar_events', 'start_min'),
    ('exec_calendar_events', 'end_min'),
    ('exec_calendar_events', 'all_day'),
    ('exec_calendar_events', 'visibility'),
    ('exec_calendar_events', 'location'),
    ('exec_calendar_events', 'notes'),
    ('exec_calendar_events', 'client_entry_id'),
    ('exec_calendar_events', 'batch_label'),
    ('exec_calendar_events', 'routine_id'),
    ('exec_calendar_events', 'created_by_id'),
    ('exec_calendar_events', 'updated_by_id'),
    ('exec_calendar_events', 'created_at'),
    ('exec_calendar_events', 'updated_at'),
    ('exec_calendar_routines', 'id'),
    ('exec_calendar_routines', 'owner_id'),
    ('exec_calendar_routines', 'title'),
    ('exec_calendar_routines', 'category_key'),
    ('exec_calendar_routines', 'days_of_week'),
    ('exec_calendar_routines', 'start_min'),
    ('exec_calendar_routines', 'end_min'),
    ('exec_calendar_routines', 'from_date'),
    ('exec_calendar_routines', 'to_date'),
    ('exec_calendar_routines', 'visibility'),
    ('exec_calendar_routines', 'is_active'),
    ('exec_calendar_routines', 'created_by_id'),
    ('exec_calendar_routines', 'created_at'),
    ('exec_calendar_routines', 'updated_at'),
    ('exec_calendar_prefs', 'employee_id'),
    ('exec_calendar_prefs', 'start_min'),
    ('exec_calendar_prefs', 'end_min'),
    ('exec_calendar_prefs', 'slot_min'),
    ('exec_calendar_prefs', 'updated_at'),
    ('billing_customer_contacts', 'id'),
    ('billing_customer_contacts', 'customer_id'),
    ('billing_customer_contacts', 'first_name'),
    ('billing_customer_contacts', 'last_name'),
    ('billing_customer_contacts', 'phone'),
    ('billing_customer_contacts', 'email'),
    ('billing_customer_contacts', 'designation'),
    ('billing_customer_contacts', 'department'),
    ('billing_customer_contacts', 'notes'),
    ('billing_customer_contacts', 'is_primary'),
    ('billing_customer_contacts', 'sort_order'),
    ('billing_customer_contacts', 'created_at'),
    ('billing_customer_contacts', 'updated_at'),
    ('billing_customer_addresses', 'id'),
    ('billing_customer_addresses', 'customer_id'),
    ('billing_customer_addresses', 'kind'),
    ('billing_customer_addresses', 'label'),
    ('billing_customer_addresses', 'line1'),
    ('billing_customer_addresses', 'line2'),
    ('billing_customer_addresses', 'line3'),
    ('billing_customer_addresses', 'line4'),
    ('billing_customer_addresses', 'city'),
    ('billing_customer_addresses', 'state_name'),
    ('billing_customer_addresses', 'state_code'),
    ('billing_customer_addresses', 'country'),
    ('billing_customer_addresses', 'pincode'),
    ('billing_customer_addresses', 'sort_order'),
    ('billing_customer_addresses', 'created_at'),
    ('billing_customer_addresses', 'updated_at'),
    ('billing_customer_documents', 'id'),
    ('billing_customer_documents', 'customer_id'),
    ('billing_customer_documents', 'slot'),
    ('billing_customer_documents', 'file_name'),
    ('billing_customer_documents', 'storage_path'),
    ('billing_customer_documents', 'content_type'),
    ('billing_customer_documents', 'size_bytes'),
    ('billing_customer_documents', 'uploaded_at'),
    ('billing_customer_documents', 'uploaded_by_id'),
    ('billing_lookups', 'id'),
    ('billing_lookups', 'kind'),
    ('billing_lookups', 'value'),
    ('billing_lookups', 'sort_order'),
    ('billing_lookups', 'active'),
    ('billing_lookups', 'deleted_at'),
    ('billing_lookups', 'created_at'),
    ('billing_lookups', 'created_by_id'),
    ('billing_contracts', 'id'),
    ('billing_contracts', 'entity_id'),
    ('billing_contracts', 'customer_id'),
    ('billing_contracts', 'customer_name'),
    ('billing_contracts', 'total_value'),
    ('billing_contracts', 'start_date'),
    ('billing_contracts', 'end_date'),
    ('billing_contracts', 'billing_date'),
    ('billing_contracts', 'payment_type'),
    ('billing_contracts', 'billing_frequency'),
    ('billing_contracts', 'retainer_amount'),
    ('billing_contracts', 'stop_when_complete'),
    ('billing_contracts', 'status'),
    ('billing_contracts', 'stopped_at'),
    ('billing_contracts', 'stopped_by_id'),
    ('billing_contracts', 'cancelled_at'),
    ('billing_contracts', 'cancel_reason'),
    ('billing_contracts', 'notes'),
    ('billing_contracts', 'attachment_path'),
    ('billing_contracts', 'attachment_name'),
    ('billing_contracts', 'attachment_type'),
    ('billing_contracts', 'attachment_size'),
    ('billing_contracts', 'created_at'),
    ('billing_contracts', 'updated_at'),
    ('billing_contracts', 'created_by_id'),
    ('billing_contracts', 'updated_by_id'),
    ('billing_contract_items', 'id'),
    ('billing_contract_items', 'contract_id'),
    ('billing_contract_items', 'kind'),
    ('billing_contract_items', 'seq'),
    ('billing_contract_items', 'due_date'),
    ('billing_contract_items', 'description'),
    ('billing_contract_items', 'amount'),
    ('billing_contract_items', 'status'),
    ('billing_contract_items', 'document_id'),
    ('billing_contract_items', 'raised_at'),
    ('billing_contract_items', 'stopped_at'),
    ('billing_contract_items', 'created_at'),
    ('billing_contract_items', 'updated_at'),
    ('billing_contract_pdcs', 'id'),
    ('billing_contract_pdcs', 'contract_id'),
    ('billing_contract_pdcs', 'sr_no'),
    ('billing_contract_pdcs', 'cheque_date'),
    ('billing_contract_pdcs', 'cheque_no'),
    ('billing_contract_pdcs', 'bank_name'),
    ('billing_contract_pdcs', 'amount'),
    ('billing_contract_pdcs', 'drawer_name'),
    ('billing_contract_pdcs', 'status'),
    ('billing_contract_pdcs', 'created_at'),
    ('billing_contract_pdcs', 'updated_at'),
    ('exec_calendar_day_markers', 'id'),
    ('exec_calendar_day_markers', 'owner_id'),
    ('exec_calendar_day_markers', 'label'),
    ('exec_calendar_day_markers', 'mode'),
    ('exec_calendar_day_markers', 'dates'),
    ('exec_calendar_day_markers', 'created_by_id'),
    ('exec_calendar_day_markers', 'created_at'),
    ('exec_calendar_day_markers', 'updated_at'),
    ('ce_team_members', 'id'),
    ('ce_team_members', 'name'),
    ('ce_team_members', 'employee_id'),
    ('ce_team_members', 'email'),
    ('ce_team_members', 'role'),
    ('ce_team_members', 'active_client_limit'),
    ('ce_team_members', 'is_active'),
    ('ce_team_members', 'sort_order'),
    ('ce_team_members', 'created_by'),
    ('ce_team_members', 'created_at'),
    ('ce_team_members', 'updated_at'),
    ('ce_accounts', 'id'),
    ('ce_accounts', 'full_name'),
    ('ce_accounts', 'organization'),
    ('ce_accounts', 'category'),
    ('ce_accounts', 'batch_code'),
    ('ce_accounts', 'assigned_to'),
    ('ce_accounts', 'lifecycle_status'),
    ('ce_accounts', 'hh_status'),
    ('ce_accounts', 'start_date'),
    ('ce_accounts', 'end_date'),
    ('ce_accounts', 'tags'),
    ('ce_accounts', 'notes'),
    ('ce_accounts', 'hh_entry_id'),
    ('ce_accounts', 'created_by'),
    ('ce_accounts', 'created_at'),
    ('ce_accounts', 'updated_at'),
    ('ce_engagements', 'id'),
    ('ce_engagements', 'account_id'),
    ('ce_engagements', 'team_member_id'),
    ('ce_engagements', 'call_type'),
    ('ce_engagements', 'day_of_week'),
    ('ce_engagements', 'start_time'),
    ('ce_engagements', 'end_time'),
    ('ce_engagements', 'start_date'),
    ('ce_engagements', 'end_date'),
    ('ce_engagements', 'notes'),
    ('ce_engagements', 'created_by'),
    ('ce_engagements', 'created_at'),
    ('ce_engagements', 'updated_at'),
    ('ce_references', 'id'),
    ('ce_references', 'account_id'),
    ('ce_references', 'collector_id'),
    ('ce_references', 'target_program'),
    ('ce_references', 'target_count'),
    ('ce_references', 'actual_collected'),
    ('ce_references', 'frequency'),
    ('ce_references', 'due_date'),
    ('ce_references', 'notes'),
    ('ce_references', 'last_reminded_on'),
    ('ce_references', 'created_by'),
    ('ce_references', 'created_at'),
    ('ce_references', 'updated_at'),
    ('ce_audit_log', 'id'),
    ('ce_audit_log', 'entity_type'),
    ('ce_audit_log', 'entity_id'),
    ('ce_audit_log', 'action'),
    ('ce_audit_log', 'summary'),
    ('ce_audit_log', 'before'),
    ('ce_audit_log', 'after'),
    ('ce_audit_log', 'actor_id'),
    ('ce_audit_log', 'created_at'),
    ('visibility_grants', 'id'),
    ('visibility_grants', 'domain'),
    ('visibility_grants', 'employee_id'),
    ('visibility_grants', 'target_id'),
    ('visibility_grants', 'note'),
    ('visibility_grants', 'granted_by_id'),
    ('visibility_grants', 'created_at'),
    ('incentive_function_scope', 'catalog_id'),
    ('incentive_function_scope', 'function_id'),
    ('incentive_function_scope', 'created_at'),
    ('module_backup_settings', 'id'),
    ('module_backup_settings', 'account_email'),
    ('module_backup_settings', 'refresh_token_enc'),
    ('module_backup_settings', 'connected_by_id'),
    ('module_backup_settings', 'connected_at'),
    ('module_backup_settings', 'root_folder_id'),
    ('module_backup_settings', 'schedule_enabled'),
    ('module_backup_settings', 'run_hour_ist'),
    ('module_backup_settings', 'last_error'),
    ('module_backup_settings', 'updated_at'),
    ('module_backup_modules', 'module_id'),
    ('module_backup_modules', 'enabled'),
    ('module_backup_modules', 'exported_through'),
    ('module_backup_modules', 'last_full_at'),
    ('module_backup_modules', 'last_run_at'),
    ('module_backup_modules', 'updated_at'),
    ('module_backup_runs', 'id'),
    ('module_backup_runs', 'module_id'),
    ('module_backup_runs', 'kind'),
    ('module_backup_runs', 'status'),
    ('module_backup_runs', 'since'),
    ('module_backup_runs', 'until'),
    ('module_backup_runs', 'cursor'),
    ('module_backup_runs', 'counts'),
    ('module_backup_runs', 'folder_name'),
    ('module_backup_runs', 'requested_by_id'),
    ('module_backup_runs', 'lock_until'),
    ('module_backup_runs', 'error'),
    ('module_backup_runs', 'started_at'),
    ('module_backup_runs', 'finished_at'),
    ('module_backup_grants', 'id'),
    ('module_backup_grants', 'module_id'),
    ('module_backup_grants', 'employee_id'),
    ('module_backup_grants', 'granted_by_id'),
    ('module_backup_grants', 'created_at'),
    ('__schema_applied', 'filename'),
    ('__schema_applied', 'applied_at'),
    ('daily_sessions', 'id'),
    ('daily_sessions', 'employee_id'),
    ('daily_sessions', 'date_ist'),
    ('daily_sessions', 'first_login_at'),
    ('daily_sessions', 'last_activity_at'),
    ('daily_sessions', 'logout_at'),
    ('daily_sessions', 'logout_type'),
    ('daily_sessions', 'total_estimated_minutes'),
    ('daily_sessions', 'total_event_count'),
    ('daily_sessions', 'modules_visited_count'),
    ('daily_sessions', 'pages_visited_count'),
    ('daily_sessions', 'records_viewed_count'),
    ('daily_sessions', 'actions_performed_count'),
    ('daily_sessions', 'status'),
    ('daily_sessions', 'finalized_at'),
    ('daily_sessions', 'created_at'),
    ('daily_sessions', 'updated_at'),
    ('activity_logs', 'id'),
    ('activity_logs', 'daily_session_id'),
    ('activity_logs', 'employee_id'),
    ('activity_logs', 'event_at'),
    ('activity_logs', 'event_type'),
    ('activity_logs', 'module'),
    ('activity_logs', 'page'),
    ('activity_logs', 'route'),
    ('activity_logs', 'resource_type'),
    ('activity_logs', 'resource_id'),
    ('activity_logs', 'resource_name'),
    ('activity_logs', 'action'),
    ('activity_logs', 'status'),
    ('activity_logs', 'reason'),
    ('activity_logs', 'changes'),
    ('activity_logs', 'metadata'),
    ('activity_logs', 'request_id'),
    ('activity_logs', 'operation_id'),
    ('activity_logs', 'client_event_id'),
    ('activity_logs', 'actor_type'),
    ('activity_logs', 'created_at'),
    ('roles', 'id'),
    ('roles', 'name'),
    ('roles', 'description'),
    ('roles', 'is_system'),
    ('roles', 'created_by_id'),
    ('roles', 'created_at'),
    ('roles', 'updated_at'),
    ('role_permissions', 'id'),
    ('role_permissions', 'role_id'),
    ('role_permissions', 'node_key'),
    ('role_permissions', 'action'),
    ('role_permissions', 'scope'),
    ('role_permissions', 'created_at'),
    ('role_permissions', 'updated_at'),
    ('employee_roles', 'id'),
    ('employee_roles', 'employee_id'),
    ('employee_roles', 'role_id'),
    ('employee_roles', 'assigned_by_id'),
    ('employee_roles', 'created_at')
)
select n.table_name, n.column_name, 'STILL MISSING' as status
from needed n
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name   = n.table_name
 and c.column_name  = n.column_name
where c.column_name is null
  -- ONLY report a table that is ALREADY THERE. If the table does not exist,
  -- CREATE TABLE IF NOT EXISTS will build it correctly and there is no clash —
  -- without this line every column of every unbuilt table reports as missing,
  -- which buries the two tables that genuinely need patching.
  and to_regclass('public.' || n.table_name) is not null
order by n.table_name, n.column_name;

-- Nothing above = every column this delivery needs is already present (or its
-- table does not exist yet, in which case CREATE will make it properly).
--
-- Source file for each column checked:
--   hr_contacts.id  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.company_name  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.person_name  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.cell_no  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.alternate_no  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.email  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.service  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.notes  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.is_active  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.created_by_id  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.updated_by_id  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.created_at  <-  0227_hr_address_book_asset_register.sql
--   hr_contacts.updated_at  <-  0227_hr_address_book_asset_register.sql
--   hr_asset_counters.prefix  <-  0227_hr_address_book_asset_register.sql
--   hr_asset_counters.last  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.id  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.asset_code  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.asset_type  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.asset_name  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.location  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.serial_no  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.model  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.make  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.description  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.specifications  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.warranty_until  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.under_amc  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.vendor_name  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.photo_path  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.invoice_path  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.issued_kind  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.issued_employee_id  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.issued_office  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.notes  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.username  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.password_enc  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.created_by_id  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.updated_by_id  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.created_at  <-  0227_hr_address_book_asset_register.sql
--   hr_assets.updated_at  <-  0227_hr_address_book_asset_register.sql
--   ops_vendors.id  <-  0228_ops_vendor_directory.sql
--   ops_vendors.category  <-  0228_ops_vendor_directory.sql
--   ops_vendors.first_name  <-  0228_ops_vendor_directory.sql
--   ops_vendors.last_name  <-  0228_ops_vendor_directory.sql
--   ops_vendors.cell_no  <-  0228_ops_vendor_directory.sql
--   ops_vendors.email  <-  0228_ops_vendor_directory.sql
--   ops_vendors.address_line1  <-  0228_ops_vendor_directory.sql
--   ops_vendors.address_line2  <-  0228_ops_vendor_directory.sql
--   ops_vendors.address_line3  <-  0228_ops_vendor_directory.sql
--   ops_vendors.address_line4  <-  0228_ops_vendor_directory.sql
--   ops_vendors.landmark  <-  0228_ops_vendor_directory.sql
--   ops_vendors.city  <-  0228_ops_vendor_directory.sql
--   ops_vendors.state  <-  0228_ops_vendor_directory.sql
--   ops_vendors.pincode  <-  0228_ops_vendor_directory.sql
--   ops_vendors.website  <-  0228_ops_vendor_directory.sql
--   ops_vendors.amc  <-  0228_ops_vendor_directory.sql
--   ops_vendors.notes  <-  0228_ops_vendor_directory.sql
--   ops_vendors.is_active  <-  0228_ops_vendor_directory.sql
--   ops_vendors.created_by_id  <-  0228_ops_vendor_directory.sql
--   ops_vendors.updated_by_id  <-  0228_ops_vendor_directory.sql
--   ops_vendors.created_at  <-  0228_ops_vendor_directory.sql
--   ops_vendors.updated_at  <-  0228_ops_vendor_directory.sql
--   billing_payment_terms.id  <-  0229_billing_documents.sql
--   billing_payment_terms.label  <-  0229_billing_documents.sql
--   billing_payment_terms.due_days  <-  0229_billing_documents.sql
--   billing_payment_terms.is_default  <-  0229_billing_documents.sql
--   billing_payment_terms.is_active  <-  0229_billing_documents.sql
--   billing_payment_terms.sort_order  <-  0229_billing_documents.sql
--   billing_payment_terms.created_at  <-  0229_billing_documents.sql
--   billing_payment_terms.updated_at  <-  0229_billing_documents.sql
--   billing_sac_codes.id  <-  0229_billing_documents.sql
--   billing_sac_codes.code  <-  0229_billing_documents.sql
--   billing_sac_codes.description  <-  0229_billing_documents.sql
--   billing_sac_codes.default_gst_rate  <-  0229_billing_documents.sql
--   billing_sac_codes.is_active  <-  0229_billing_documents.sql
--   billing_sac_codes.sort_order  <-  0229_billing_documents.sql
--   billing_sac_codes.created_at  <-  0229_billing_documents.sql
--   billing_sac_codes.updated_at  <-  0229_billing_documents.sql
--   billing_entity_profiles.id  <-  0229_billing_documents.sql
--   billing_entity_profiles.entity_id  <-  0229_billing_documents.sql
--   billing_entity_profiles.paying_entity_id  <-  0229_billing_documents.sql
--   billing_entity_profiles.legal_name  <-  0229_billing_documents.sql
--   billing_entity_profiles.pan  <-  0229_billing_documents.sql
--   billing_entity_profiles.gstin  <-  0229_billing_documents.sql
--   billing_entity_profiles.state_name  <-  0229_billing_documents.sql
--   billing_entity_profiles.state_code  <-  0229_billing_documents.sql
--   billing_entity_profiles.address_line  <-  0229_billing_documents.sql
--   billing_entity_profiles.email  <-  0229_billing_documents.sql
--   billing_entity_profiles.whatsapp  <-  0229_billing_documents.sql
--   billing_entity_profiles.phone  <-  0229_billing_documents.sql
--   billing_entity_profiles.website  <-  0229_billing_documents.sql
--   billing_entity_profiles.logo_url  <-  0229_billing_documents.sql
--   billing_entity_profiles.bank_name  <-  0229_billing_documents.sql
--   billing_entity_profiles.bank_account_name  <-  0229_billing_documents.sql
--   billing_entity_profiles.bank_account_no  <-  0229_billing_documents.sql
--   billing_entity_profiles.bank_ifsc  <-  0229_billing_documents.sql
--   billing_entity_profiles.bank_branch  <-  0229_billing_documents.sql
--   billing_entity_profiles.upi_id  <-  0229_billing_documents.sql
--   billing_entity_profiles.default_sac_code  <-  0229_billing_documents.sql
--   billing_entity_profiles.signatory_name  <-  0229_billing_documents.sql
--   billing_entity_profiles.signatory_designation  <-  0229_billing_documents.sql
--   billing_entity_profiles.signature_image_url  <-  0229_billing_documents.sql
--   billing_entity_profiles.default_payment_terms_id  <-  0229_billing_documents.sql
--   billing_entity_profiles.interest_clause  <-  0229_billing_documents.sql
--   billing_entity_profiles.invoice_footer_note  <-  0229_billing_documents.sql
--   billing_entity_profiles.is_active  <-  0229_billing_documents.sql
--   billing_entity_profiles.created_at  <-  0229_billing_documents.sql
--   billing_entity_profiles.updated_at  <-  0229_billing_documents.sql
--   billing_entity_profiles.created_by_id  <-  0229_billing_documents.sql
--   billing_entity_profiles.updated_by_id  <-  0229_billing_documents.sql
--   billing_customers.id  <-  0229_billing_documents.sql
--   billing_customers.name  <-  0229_billing_documents.sql
--   billing_customers.legal_name  <-  0229_billing_documents.sql
--   billing_customers.contact_name  <-  0229_billing_documents.sql
--   billing_customers.email  <-  0229_billing_documents.sql
--   billing_customers.whatsapp  <-  0229_billing_documents.sql
--   billing_customers.phone  <-  0229_billing_documents.sql
--   billing_customers.pan  <-  0229_billing_documents.sql
--   billing_customers.gstin  <-  0229_billing_documents.sql
--   billing_customers.address_line1  <-  0229_billing_documents.sql
--   billing_customers.address_line2  <-  0229_billing_documents.sql
--   billing_customers.city  <-  0229_billing_documents.sql
--   billing_customers.state_name  <-  0229_billing_documents.sql
--   billing_customers.state_code  <-  0229_billing_documents.sql
--   billing_customers.pincode  <-  0229_billing_documents.sql
--   billing_customers.country  <-  0229_billing_documents.sql
--   billing_customers.client_id  <-  0229_billing_documents.sql
--   billing_customers.outstanding_entity_id  <-  0229_billing_documents.sql
--   billing_customers.notes  <-  0229_billing_documents.sql
--   billing_customers.is_active  <-  0229_billing_documents.sql
--   billing_customers.created_at  <-  0229_billing_documents.sql
--   billing_customers.updated_at  <-  0229_billing_documents.sql
--   billing_customers.created_by_id  <-  0229_billing_documents.sql
--   billing_customers.updated_by_id  <-  0229_billing_documents.sql
--   billing_number_series.id  <-  0229_billing_documents.sql
--   billing_number_series.entity_id  <-  0229_billing_documents.sql
--   billing_number_series.doc_type  <-  0229_billing_documents.sql
--   billing_number_series.fin_year  <-  0229_billing_documents.sql
--   billing_number_series.prefix  <-  0229_billing_documents.sql
--   billing_number_series.next_seq  <-  0229_billing_documents.sql
--   billing_number_series.pad_width  <-  0229_billing_documents.sql
--   billing_number_series.created_at  <-  0229_billing_documents.sql
--   billing_number_series.updated_at  <-  0229_billing_documents.sql
--   billing_series_defaults.id  <-  0229_billing_documents.sql
--   billing_series_defaults.entity_id  <-  0229_billing_documents.sql
--   billing_series_defaults.doc_type  <-  0229_billing_documents.sql
--   billing_series_defaults.prefix  <-  0229_billing_documents.sql
--   billing_series_defaults.start_seq  <-  0229_billing_documents.sql
--   billing_series_defaults.pad_width  <-  0229_billing_documents.sql
--   billing_series_defaults.created_at  <-  0229_billing_documents.sql
--   billing_series_defaults.updated_at  <-  0229_billing_documents.sql
--   billing_documents.id  <-  0229_billing_documents.sql
--   billing_documents.doc_type  <-  0229_billing_documents.sql
--   billing_documents.doc_no  <-  0229_billing_documents.sql
--   billing_documents.fin_year  <-  0229_billing_documents.sql
--   billing_documents.seq  <-  0229_billing_documents.sql
--   billing_documents.doc_date  <-  0229_billing_documents.sql
--   billing_documents.due_date  <-  0229_billing_documents.sql
--   billing_documents.status  <-  0229_billing_documents.sql
--   billing_documents.entity_id  <-  0229_billing_documents.sql
--   billing_documents.entity_profile_id  <-  0229_billing_documents.sql
--   billing_documents.seller_snapshot  <-  0229_billing_documents.sql
--   billing_documents.customer_id  <-  0229_billing_documents.sql
--   billing_documents.customer_snapshot  <-  0229_billing_documents.sql
--   billing_documents.customer_name  <-  0229_billing_documents.sql
--   billing_documents.customer_contact_name  <-  0229_billing_documents.sql
--   billing_documents.customer_email  <-  0229_billing_documents.sql
--   billing_documents.customer_whatsapp  <-  0229_billing_documents.sql
--   billing_documents.customer_gstin  <-  0229_billing_documents.sql
--   billing_documents.place_of_supply_state  <-  0229_billing_documents.sql
--   billing_documents.place_of_supply_code  <-  0229_billing_documents.sql
--   billing_documents.service_description  <-  0229_billing_documents.sql
--   billing_documents.sac_code  <-  0229_billing_documents.sql
--   billing_documents.payment_terms_id  <-  0229_billing_documents.sql
--   billing_documents.payment_terms_label  <-  0229_billing_documents.sql
--   billing_documents.remarks  <-  0229_billing_documents.sql
--   billing_documents.gst_mode  <-  0229_billing_documents.sql
--   billing_documents.gst_applicable  <-  0229_billing_documents.sql
--   billing_documents.is_reverse_charge  <-  0229_billing_documents.sql
--   billing_documents.subtotal  <-  0229_billing_documents.sql
--   billing_documents.discount_total  <-  0229_billing_documents.sql
--   billing_documents.taxable_value  <-  0229_billing_documents.sql
--   billing_documents.cgst_amount  <-  0229_billing_documents.sql
--   billing_documents.sgst_amount  <-  0229_billing_documents.sql
--   billing_documents.igst_amount  <-  0229_billing_documents.sql
--   billing_documents.round_off  <-  0229_billing_documents.sql
--   billing_documents.total  <-  0229_billing_documents.sql
--   billing_documents.amount_in_words  <-  0229_billing_documents.sql
--   billing_documents.currency  <-  0229_billing_documents.sql
--   billing_documents.source_document_id  <-  0229_billing_documents.sql
--   billing_documents.source_doc_no  <-  0229_billing_documents.sql
--   billing_documents.source_doc_type  <-  0229_billing_documents.sql
--   billing_documents.generated_at  <-  0229_billing_documents.sql
--   billing_documents.sent_at  <-  0229_billing_documents.sql
--   billing_documents.last_sent_to  <-  0229_billing_documents.sql
--   billing_documents.paid_at  <-  0229_billing_documents.sql
--   billing_documents.paid_amount  <-  0229_billing_documents.sql
--   billing_documents.cancelled_at  <-  0229_billing_documents.sql
--   billing_documents.cancel_reason  <-  0229_billing_documents.sql
--   billing_documents.pdf_storage_path  <-  0229_billing_documents.sql
--   billing_documents.created_at  <-  0229_billing_documents.sql
--   billing_documents.updated_at  <-  0229_billing_documents.sql
--   billing_documents.created_by_id  <-  0229_billing_documents.sql
--   billing_documents.updated_by_id  <-  0229_billing_documents.sql
--   billing_document_lines.id  <-  0229_billing_documents.sql
--   billing_document_lines.document_id  <-  0229_billing_documents.sql
--   billing_document_lines.product_id  <-  0229_billing_documents.sql
--   billing_document_lines.code  <-  0229_billing_documents.sql
--   billing_document_lines.name  <-  0229_billing_documents.sql
--   billing_document_lines.description  <-  0229_billing_documents.sql
--   billing_document_lines.sac_code  <-  0229_billing_documents.sql
--   billing_document_lines.hsn_code  <-  0229_billing_documents.sql
--   billing_document_lines.quantity  <-  0229_billing_documents.sql
--   billing_document_lines.unit  <-  0229_billing_documents.sql
--   billing_document_lines.rate  <-  0229_billing_documents.sql
--   billing_document_lines.discount_pct  <-  0229_billing_documents.sql
--   billing_document_lines.discount_amount  <-  0229_billing_documents.sql
--   billing_document_lines.amount  <-  0229_billing_documents.sql
--   billing_document_lines.gst_rate  <-  0229_billing_documents.sql
--   billing_document_lines.cgst_amount  <-  0229_billing_documents.sql
--   billing_document_lines.sgst_amount  <-  0229_billing_documents.sql
--   billing_document_lines.igst_amount  <-  0229_billing_documents.sql
--   billing_document_lines.line_total  <-  0229_billing_documents.sql
--   billing_document_lines.sort_order  <-  0229_billing_documents.sql
--   billing_document_lines.created_at  <-  0229_billing_documents.sql
--   billing_document_lines.updated_at  <-  0229_billing_documents.sql
--   billing_document_events.id  <-  0229_billing_documents.sql
--   billing_document_events.document_id  <-  0229_billing_documents.sql
--   billing_document_events.actor_id  <-  0229_billing_documents.sql
--   billing_document_events.event_type  <-  0229_billing_documents.sql
--   billing_document_events.meta  <-  0229_billing_documents.sql
--   billing_document_events.created_at  <-  0229_billing_documents.sql
--   billing_email_log.id  <-  0229_billing_documents.sql
--   billing_email_log.document_id  <-  0229_billing_documents.sql
--   billing_email_log.recipient  <-  0229_billing_documents.sql
--   billing_email_log.cc  <-  0229_billing_documents.sql
--   billing_email_log.bcc  <-  0229_billing_documents.sql
--   billing_email_log.subject  <-  0229_billing_documents.sql
--   billing_email_log.body  <-  0229_billing_documents.sql
--   billing_email_log.attachment  <-  0229_billing_documents.sql
--   billing_email_log.status  <-  0229_billing_documents.sql
--   billing_email_log.error  <-  0229_billing_documents.sql
--   billing_email_log.sent_at  <-  0229_billing_documents.sql
--   billing_email_log.sent_by_id  <-  0229_billing_documents.sql
--   pa_assignment_events.id  <-  0230_client_engagement.sql
--   pa_assignment_events.entity_type  <-  0230_client_engagement.sql
--   pa_assignment_events.entity_id  <-  0230_client_engagement.sql
--   pa_assignment_events.from_person_id  <-  0230_client_engagement.sql
--   pa_assignment_events.to_person_id  <-  0230_client_engagement.sql
--   pa_assignment_events.actor_id  <-  0230_client_engagement.sql
--   pa_assignment_events.created_at  <-  0230_client_engagement.sql
--   ce_dropdown_options.id  <-  0230_client_engagement.sql
--   ce_dropdown_options.list_key  <-  0230_client_engagement.sql
--   ce_dropdown_options.code  <-  0230_client_engagement.sql
--   ce_dropdown_options.label  <-  0230_client_engagement.sql
--   ce_dropdown_options.sort_order  <-  0230_client_engagement.sql
--   ce_dropdown_options.is_active  <-  0230_client_engagement.sql
--   ce_dropdown_options.created_by  <-  0230_client_engagement.sql
--   ce_dropdown_options.created_at  <-  0230_client_engagement.sql
--   ce_dropdown_options.updated_at  <-  0230_client_engagement.sql
--   exec_calendar_events.id  <-  0231_exec_calendar.sql
--   exec_calendar_events.owner_id  <-  0231_exec_calendar.sql
--   exec_calendar_events.title  <-  0231_exec_calendar.sql
--   exec_calendar_events.category_key  <-  0231_exec_calendar.sql
--   exec_calendar_events.event_date  <-  0231_exec_calendar.sql
--   exec_calendar_events.start_min  <-  0231_exec_calendar.sql
--   exec_calendar_events.end_min  <-  0231_exec_calendar.sql
--   exec_calendar_events.all_day  <-  0231_exec_calendar.sql
--   exec_calendar_events.visibility  <-  0231_exec_calendar.sql
--   exec_calendar_events.location  <-  0231_exec_calendar.sql
--   exec_calendar_events.notes  <-  0231_exec_calendar.sql
--   exec_calendar_events.client_entry_id  <-  0231_exec_calendar.sql
--   exec_calendar_events.batch_label  <-  0231_exec_calendar.sql
--   exec_calendar_events.routine_id  <-  0231_exec_calendar.sql
--   exec_calendar_events.created_by_id  <-  0231_exec_calendar.sql
--   exec_calendar_events.updated_by_id  <-  0231_exec_calendar.sql
--   exec_calendar_events.created_at  <-  0231_exec_calendar.sql
--   exec_calendar_events.updated_at  <-  0231_exec_calendar.sql
--   exec_calendar_routines.id  <-  0231_exec_calendar.sql
--   exec_calendar_routines.owner_id  <-  0231_exec_calendar.sql
--   exec_calendar_routines.title  <-  0231_exec_calendar.sql
--   exec_calendar_routines.category_key  <-  0231_exec_calendar.sql
--   exec_calendar_routines.days_of_week  <-  0231_exec_calendar.sql
--   exec_calendar_routines.start_min  <-  0231_exec_calendar.sql
--   exec_calendar_routines.end_min  <-  0231_exec_calendar.sql
--   exec_calendar_routines.from_date  <-  0231_exec_calendar.sql
--   exec_calendar_routines.to_date  <-  0231_exec_calendar.sql
--   exec_calendar_routines.visibility  <-  0231_exec_calendar.sql
--   exec_calendar_routines.is_active  <-  0231_exec_calendar.sql
--   exec_calendar_routines.created_by_id  <-  0231_exec_calendar.sql
--   exec_calendar_routines.created_at  <-  0231_exec_calendar.sql
--   exec_calendar_routines.updated_at  <-  0231_exec_calendar.sql
--   exec_calendar_prefs.employee_id  <-  0231_exec_calendar.sql
--   exec_calendar_prefs.start_min  <-  0231_exec_calendar.sql
--   exec_calendar_prefs.end_min  <-  0231_exec_calendar.sql
--   exec_calendar_prefs.slot_min  <-  0231_exec_calendar.sql
--   exec_calendar_prefs.updated_at  <-  0231_exec_calendar.sql
--   billing_customer_contacts.id  <-  0233_customer_kyc.sql
--   billing_customer_contacts.customer_id  <-  0233_customer_kyc.sql
--   billing_customer_contacts.first_name  <-  0233_customer_kyc.sql
--   billing_customer_contacts.last_name  <-  0233_customer_kyc.sql
--   billing_customer_contacts.phone  <-  0233_customer_kyc.sql
--   billing_customer_contacts.email  <-  0233_customer_kyc.sql
--   billing_customer_contacts.designation  <-  0233_customer_kyc.sql
--   billing_customer_contacts.department  <-  0233_customer_kyc.sql
--   billing_customer_contacts.notes  <-  0233_customer_kyc.sql
--   billing_customer_contacts.is_primary  <-  0233_customer_kyc.sql
--   billing_customer_contacts.sort_order  <-  0233_customer_kyc.sql
--   billing_customer_contacts.created_at  <-  0233_customer_kyc.sql
--   billing_customer_contacts.updated_at  <-  0233_customer_kyc.sql
--   billing_customer_addresses.id  <-  0233_customer_kyc.sql
--   billing_customer_addresses.customer_id  <-  0233_customer_kyc.sql
--   billing_customer_addresses.kind  <-  0233_customer_kyc.sql
--   billing_customer_addresses.label  <-  0233_customer_kyc.sql
--   billing_customer_addresses.line1  <-  0233_customer_kyc.sql
--   billing_customer_addresses.line2  <-  0233_customer_kyc.sql
--   billing_customer_addresses.line3  <-  0233_customer_kyc.sql
--   billing_customer_addresses.line4  <-  0233_customer_kyc.sql
--   billing_customer_addresses.city  <-  0233_customer_kyc.sql
--   billing_customer_addresses.state_name  <-  0233_customer_kyc.sql
--   billing_customer_addresses.state_code  <-  0233_customer_kyc.sql
--   billing_customer_addresses.country  <-  0233_customer_kyc.sql
--   billing_customer_addresses.pincode  <-  0233_customer_kyc.sql
--   billing_customer_addresses.sort_order  <-  0233_customer_kyc.sql
--   billing_customer_addresses.created_at  <-  0233_customer_kyc.sql
--   billing_customer_addresses.updated_at  <-  0233_customer_kyc.sql
--   billing_customer_documents.id  <-  0233_customer_kyc.sql
--   billing_customer_documents.customer_id  <-  0233_customer_kyc.sql
--   billing_customer_documents.slot  <-  0233_customer_kyc.sql
--   billing_customer_documents.file_name  <-  0233_customer_kyc.sql
--   billing_customer_documents.storage_path  <-  0233_customer_kyc.sql
--   billing_customer_documents.content_type  <-  0233_customer_kyc.sql
--   billing_customer_documents.size_bytes  <-  0233_customer_kyc.sql
--   billing_customer_documents.uploaded_at  <-  0233_customer_kyc.sql
--   billing_customer_documents.uploaded_by_id  <-  0233_customer_kyc.sql
--   billing_lookups.id  <-  0233_customer_kyc.sql
--   billing_lookups.kind  <-  0233_customer_kyc.sql
--   billing_lookups.value  <-  0233_customer_kyc.sql
--   billing_lookups.sort_order  <-  0233_customer_kyc.sql
--   billing_lookups.active  <-  0233_customer_kyc.sql
--   billing_lookups.deleted_at  <-  0233_customer_kyc.sql
--   billing_lookups.created_at  <-  0233_customer_kyc.sql
--   billing_lookups.created_by_id  <-  0233_customer_kyc.sql
--   billing_contracts.id  <-  0234_billing_contracts.sql
--   billing_contracts.entity_id  <-  0234_billing_contracts.sql
--   billing_contracts.customer_id  <-  0234_billing_contracts.sql
--   billing_contracts.customer_name  <-  0234_billing_contracts.sql
--   billing_contracts.total_value  <-  0234_billing_contracts.sql
--   billing_contracts.start_date  <-  0234_billing_contracts.sql
--   billing_contracts.end_date  <-  0234_billing_contracts.sql
--   billing_contracts.billing_date  <-  0234_billing_contracts.sql
--   billing_contracts.payment_type  <-  0234_billing_contracts.sql
--   billing_contracts.billing_frequency  <-  0234_billing_contracts.sql
--   billing_contracts.retainer_amount  <-  0234_billing_contracts.sql
--   billing_contracts.stop_when_complete  <-  0234_billing_contracts.sql
--   billing_contracts.status  <-  0234_billing_contracts.sql
--   billing_contracts.stopped_at  <-  0234_billing_contracts.sql
--   billing_contracts.stopped_by_id  <-  0234_billing_contracts.sql
--   billing_contracts.cancelled_at  <-  0234_billing_contracts.sql
--   billing_contracts.cancel_reason  <-  0234_billing_contracts.sql
--   billing_contracts.notes  <-  0234_billing_contracts.sql
--   billing_contracts.attachment_path  <-  0234_billing_contracts.sql
--   billing_contracts.attachment_name  <-  0234_billing_contracts.sql
--   billing_contracts.attachment_type  <-  0234_billing_contracts.sql
--   billing_contracts.attachment_size  <-  0234_billing_contracts.sql
--   billing_contracts.created_at  <-  0234_billing_contracts.sql
--   billing_contracts.updated_at  <-  0234_billing_contracts.sql
--   billing_contracts.created_by_id  <-  0234_billing_contracts.sql
--   billing_contracts.updated_by_id  <-  0234_billing_contracts.sql
--   billing_contract_items.id  <-  0234_billing_contracts.sql
--   billing_contract_items.contract_id  <-  0234_billing_contracts.sql
--   billing_contract_items.kind  <-  0234_billing_contracts.sql
--   billing_contract_items.seq  <-  0234_billing_contracts.sql
--   billing_contract_items.due_date  <-  0234_billing_contracts.sql
--   billing_contract_items.description  <-  0234_billing_contracts.sql
--   billing_contract_items.amount  <-  0234_billing_contracts.sql
--   billing_contract_items.status  <-  0234_billing_contracts.sql
--   billing_contract_items.document_id  <-  0234_billing_contracts.sql
--   billing_contract_items.raised_at  <-  0234_billing_contracts.sql
--   billing_contract_items.stopped_at  <-  0234_billing_contracts.sql
--   billing_contract_items.created_at  <-  0234_billing_contracts.sql
--   billing_contract_items.updated_at  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.id  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.contract_id  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.sr_no  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.cheque_date  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.cheque_no  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.bank_name  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.amount  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.drawer_name  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.status  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.created_at  <-  0234_billing_contracts.sql
--   billing_contract_pdcs.updated_at  <-  0234_billing_contracts.sql
--   exec_calendar_day_markers.id  <-  0237_exec_calendar_categories_markers.sql
--   exec_calendar_day_markers.owner_id  <-  0237_exec_calendar_categories_markers.sql
--   exec_calendar_day_markers.label  <-  0237_exec_calendar_categories_markers.sql
--   exec_calendar_day_markers.mode  <-  0237_exec_calendar_categories_markers.sql
--   exec_calendar_day_markers.dates  <-  0237_exec_calendar_categories_markers.sql
--   exec_calendar_day_markers.created_by_id  <-  0237_exec_calendar_categories_markers.sql
--   exec_calendar_day_markers.created_at  <-  0237_exec_calendar_categories_markers.sql
--   exec_calendar_day_markers.updated_at  <-  0237_exec_calendar_categories_markers.sql
--   ce_team_members.id  <-  0238_client_engagement_v2.sql
--   ce_team_members.name  <-  0238_client_engagement_v2.sql
--   ce_team_members.employee_id  <-  0238_client_engagement_v2.sql
--   ce_team_members.email  <-  0238_client_engagement_v2.sql
--   ce_team_members.role  <-  0238_client_engagement_v2.sql
--   ce_team_members.active_client_limit  <-  0238_client_engagement_v2.sql
--   ce_team_members.is_active  <-  0238_client_engagement_v2.sql
--   ce_team_members.sort_order  <-  0238_client_engagement_v2.sql
--   ce_team_members.created_by  <-  0238_client_engagement_v2.sql
--   ce_team_members.created_at  <-  0238_client_engagement_v2.sql
--   ce_team_members.updated_at  <-  0238_client_engagement_v2.sql
--   ce_accounts.id  <-  0238_client_engagement_v2.sql
--   ce_accounts.full_name  <-  0238_client_engagement_v2.sql
--   ce_accounts.organization  <-  0238_client_engagement_v2.sql
--   ce_accounts.category  <-  0238_client_engagement_v2.sql
--   ce_accounts.batch_code  <-  0238_client_engagement_v2.sql
--   ce_accounts.assigned_to  <-  0238_client_engagement_v2.sql
--   ce_accounts.lifecycle_status  <-  0238_client_engagement_v2.sql
--   ce_accounts.hh_status  <-  0238_client_engagement_v2.sql
--   ce_accounts.start_date  <-  0238_client_engagement_v2.sql
--   ce_accounts.end_date  <-  0238_client_engagement_v2.sql
--   ce_accounts.tags  <-  0238_client_engagement_v2.sql
--   ce_accounts.notes  <-  0238_client_engagement_v2.sql
--   ce_accounts.hh_entry_id  <-  0238_client_engagement_v2.sql
--   ce_accounts.created_by  <-  0238_client_engagement_v2.sql
--   ce_accounts.created_at  <-  0238_client_engagement_v2.sql
--   ce_accounts.updated_at  <-  0238_client_engagement_v2.sql
--   ce_engagements.id  <-  0238_client_engagement_v2.sql
--   ce_engagements.account_id  <-  0238_client_engagement_v2.sql
--   ce_engagements.team_member_id  <-  0238_client_engagement_v2.sql
--   ce_engagements.call_type  <-  0238_client_engagement_v2.sql
--   ce_engagements.day_of_week  <-  0238_client_engagement_v2.sql
--   ce_engagements.start_time  <-  0238_client_engagement_v2.sql
--   ce_engagements.end_time  <-  0238_client_engagement_v2.sql
--   ce_engagements.start_date  <-  0238_client_engagement_v2.sql
--   ce_engagements.end_date  <-  0238_client_engagement_v2.sql
--   ce_engagements.notes  <-  0238_client_engagement_v2.sql
--   ce_engagements.created_by  <-  0238_client_engagement_v2.sql
--   ce_engagements.created_at  <-  0238_client_engagement_v2.sql
--   ce_engagements.updated_at  <-  0238_client_engagement_v2.sql
--   ce_references.id  <-  0238_client_engagement_v2.sql
--   ce_references.account_id  <-  0238_client_engagement_v2.sql
--   ce_references.collector_id  <-  0238_client_engagement_v2.sql
--   ce_references.target_program  <-  0238_client_engagement_v2.sql
--   ce_references.target_count  <-  0238_client_engagement_v2.sql
--   ce_references.actual_collected  <-  0238_client_engagement_v2.sql
--   ce_references.frequency  <-  0238_client_engagement_v2.sql
--   ce_references.due_date  <-  0238_client_engagement_v2.sql
--   ce_references.notes  <-  0238_client_engagement_v2.sql
--   ce_references.last_reminded_on  <-  0238_client_engagement_v2.sql
--   ce_references.created_by  <-  0238_client_engagement_v2.sql
--   ce_references.created_at  <-  0238_client_engagement_v2.sql
--   ce_references.updated_at  <-  0238_client_engagement_v2.sql
--   ce_audit_log.id  <-  0238_client_engagement_v2.sql
--   ce_audit_log.entity_type  <-  0238_client_engagement_v2.sql
--   ce_audit_log.entity_id  <-  0238_client_engagement_v2.sql
--   ce_audit_log.action  <-  0238_client_engagement_v2.sql
--   ce_audit_log.summary  <-  0238_client_engagement_v2.sql
--   ce_audit_log.before  <-  0238_client_engagement_v2.sql
--   ce_audit_log.after  <-  0238_client_engagement_v2.sql
--   ce_audit_log.actor_id  <-  0238_client_engagement_v2.sql
--   ce_audit_log.created_at  <-  0238_client_engagement_v2.sql
--   visibility_grants.id  <-  0242_visibility_grants.sql
--   visibility_grants.domain  <-  0242_visibility_grants.sql
--   visibility_grants.employee_id  <-  0242_visibility_grants.sql
--   visibility_grants.target_id  <-  0242_visibility_grants.sql
--   visibility_grants.note  <-  0242_visibility_grants.sql
--   visibility_grants.granted_by_id  <-  0242_visibility_grants.sql
--   visibility_grants.created_at  <-  0242_visibility_grants.sql
--   incentive_function_scope.catalog_id  <-  0244_incentive_applicability_and_intern_type.sql
--   incentive_function_scope.function_id  <-  0244_incentive_applicability_and_intern_type.sql
--   incentive_function_scope.created_at  <-  0244_incentive_applicability_and_intern_type.sql
--   module_backup_settings.id  <-  0244_module_backup.sql
--   module_backup_settings.account_email  <-  0244_module_backup.sql
--   module_backup_settings.refresh_token_enc  <-  0244_module_backup.sql
--   module_backup_settings.connected_by_id  <-  0244_module_backup.sql
--   module_backup_settings.connected_at  <-  0244_module_backup.sql
--   module_backup_settings.root_folder_id  <-  0244_module_backup.sql
--   module_backup_settings.schedule_enabled  <-  0244_module_backup.sql
--   module_backup_settings.run_hour_ist  <-  0244_module_backup.sql
--   module_backup_settings.last_error  <-  0244_module_backup.sql
--   module_backup_settings.updated_at  <-  0244_module_backup.sql
--   module_backup_modules.module_id  <-  0244_module_backup.sql
--   module_backup_modules.enabled  <-  0244_module_backup.sql
--   module_backup_modules.exported_through  <-  0244_module_backup.sql
--   module_backup_modules.last_full_at  <-  0244_module_backup.sql
--   module_backup_modules.last_run_at  <-  0244_module_backup.sql
--   module_backup_modules.updated_at  <-  0244_module_backup.sql
--   module_backup_runs.id  <-  0244_module_backup.sql
--   module_backup_runs.module_id  <-  0244_module_backup.sql
--   module_backup_runs.kind  <-  0244_module_backup.sql
--   module_backup_runs.status  <-  0244_module_backup.sql
--   module_backup_runs.since  <-  0244_module_backup.sql
--   module_backup_runs.until  <-  0244_module_backup.sql
--   module_backup_runs.cursor  <-  0244_module_backup.sql
--   module_backup_runs.counts  <-  0244_module_backup.sql
--   module_backup_runs.folder_name  <-  0244_module_backup.sql
--   module_backup_runs.requested_by_id  <-  0244_module_backup.sql
--   module_backup_runs.lock_until  <-  0244_module_backup.sql
--   module_backup_runs.error  <-  0244_module_backup.sql
--   module_backup_runs.started_at  <-  0244_module_backup.sql
--   module_backup_runs.finished_at  <-  0244_module_backup.sql
--   module_backup_grants.id  <-  0244_module_backup.sql
--   module_backup_grants.module_id  <-  0244_module_backup.sql
--   module_backup_grants.employee_id  <-  0244_module_backup.sql
--   module_backup_grants.granted_by_id  <-  0244_module_backup.sql
--   module_backup_grants.created_at  <-  0244_module_backup.sql
--   __schema_applied.filename  <-  0244_module_backup.sql
--   __schema_applied.applied_at  <-  0244_module_backup.sql
--   daily_sessions.id  <-  0245_global_logs.sql
--   daily_sessions.employee_id  <-  0245_global_logs.sql
--   daily_sessions.date_ist  <-  0245_global_logs.sql
--   daily_sessions.first_login_at  <-  0245_global_logs.sql
--   daily_sessions.last_activity_at  <-  0245_global_logs.sql
--   daily_sessions.logout_at  <-  0245_global_logs.sql
--   daily_sessions.logout_type  <-  0245_global_logs.sql
--   daily_sessions.total_estimated_minutes  <-  0245_global_logs.sql
--   daily_sessions.total_event_count  <-  0245_global_logs.sql
--   daily_sessions.modules_visited_count  <-  0245_global_logs.sql
--   daily_sessions.pages_visited_count  <-  0245_global_logs.sql
--   daily_sessions.records_viewed_count  <-  0245_global_logs.sql
--   daily_sessions.actions_performed_count  <-  0245_global_logs.sql
--   daily_sessions.status  <-  0245_global_logs.sql
--   daily_sessions.finalized_at  <-  0245_global_logs.sql
--   daily_sessions.created_at  <-  0245_global_logs.sql
--   daily_sessions.updated_at  <-  0245_global_logs.sql
--   activity_logs.id  <-  0245_global_logs.sql
--   activity_logs.daily_session_id  <-  0245_global_logs.sql
--   activity_logs.employee_id  <-  0245_global_logs.sql
--   activity_logs.event_at  <-  0245_global_logs.sql
--   activity_logs.event_type  <-  0245_global_logs.sql
--   activity_logs.module  <-  0245_global_logs.sql
--   activity_logs.page  <-  0245_global_logs.sql
--   activity_logs.route  <-  0245_global_logs.sql
--   activity_logs.resource_type  <-  0245_global_logs.sql
--   activity_logs.resource_id  <-  0245_global_logs.sql
--   activity_logs.resource_name  <-  0245_global_logs.sql
--   activity_logs.action  <-  0245_global_logs.sql
--   activity_logs.status  <-  0245_global_logs.sql
--   activity_logs.reason  <-  0245_global_logs.sql
--   activity_logs.changes  <-  0245_global_logs.sql
--   activity_logs.metadata  <-  0245_global_logs.sql
--   activity_logs.request_id  <-  0245_global_logs.sql
--   activity_logs.operation_id  <-  0245_global_logs.sql
--   activity_logs.client_event_id  <-  0245_global_logs.sql
--   activity_logs.actor_type  <-  0245_global_logs.sql
--   activity_logs.created_at  <-  0245_global_logs.sql
--   roles.id  <-  0246_control_panel.sql
--   roles.name  <-  0246_control_panel.sql
--   roles.description  <-  0246_control_panel.sql
--   roles.is_system  <-  0246_control_panel.sql
--   roles.created_by_id  <-  0246_control_panel.sql
--   roles.created_at  <-  0246_control_panel.sql
--   roles.updated_at  <-  0246_control_panel.sql
--   role_permissions.id  <-  0246_control_panel.sql
--   role_permissions.role_id  <-  0246_control_panel.sql
--   role_permissions.node_key  <-  0246_control_panel.sql
--   role_permissions.action  <-  0246_control_panel.sql
--   role_permissions.scope  <-  0246_control_panel.sql
--   role_permissions.created_at  <-  0246_control_panel.sql
--   role_permissions.updated_at  <-  0246_control_panel.sql
--   employee_roles.id  <-  0246_control_panel.sql
--   employee_roles.employee_id  <-  0246_control_panel.sql
--   employee_roles.role_id  <-  0246_control_panel.sql
--   employee_roles.assigned_by_id  <-  0246_control_panel.sql
--   employee_roles.created_at  <-  0246_control_panel.sql
