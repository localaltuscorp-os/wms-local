-- Billing Master compliance document fields.
ALTER TABLE billing_entity_files DROP CONSTRAINT IF EXISTS billing_entity_files_kind_chk;
ALTER TABLE billing_entity_files
  ADD CONSTRAINT billing_entity_files_kind_chk CHECK (kind IN (
    'logo', 'signature', 'document',
    'cancelled_cheque', 'gst_certificate', 'pan_card', 'aadhar_card',
    'msme_certificate', 'tin_certificate', 'signing_entity_photo',
    'signing_entity_signature'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS billing_entity_files_one_per_field_idx
  ON billing_entity_files (entity_id, kind)
  WHERE kind NOT IN ('document');
