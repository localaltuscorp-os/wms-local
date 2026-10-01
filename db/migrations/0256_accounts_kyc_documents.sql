CREATE TABLE IF NOT EXISTS "accounts_kyc_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "person" text NOT NULL,
  "document_type" text NOT NULL,
  "document_number" text,
  "issued_on" text,
  "expires_on" text,
  "file_link" text,
  "notes" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "accounts_kyc_documents_sort_idx"
  ON "accounts_kyc_documents" ("sort_order");
