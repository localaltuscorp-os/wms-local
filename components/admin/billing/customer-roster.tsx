"use client";

import * as React from "react";
import {
  BillingRecordTable,
  type FieldSpec,
  type RecordRow,
  type RecordValues,
} from "@/components/admin/billing/record-table";
import { GST_STATES } from "@/lib/billing/states";
import { saveBillingCustomer } from "@/app/(admin)/admin/billing-customers/actions";

/**
 * The customer roster, as a field list. The table, the editor and the search
 * box come from the shared record table; everything specific to customers is
 * the array below.
 */
export function BillingCustomerRoster({
  rows,
  canEdit,
}: {
  rows: RecordRow[];
  canEdit: boolean;
}) {
  const fields: FieldSpec[] = React.useMemo(
    () => [
      { key: "name", label: "Name", column: true },
      { key: "contactName", label: "Contact person", column: true },
      { key: "email", label: "Email", column: true, hint: "Pre-fills the recipient when a document is emailed." },
      { key: "whatsapp", label: "WhatsApp", placeholder: "+91…" },
      { key: "phone", label: "Phone" },
      { key: "gstin", label: "GSTIN", column: true, hint: "Blank means an unregistered customer — a valid state." },
      { key: "pan", label: "PAN" },
      { key: "legalName", label: "Legal name", wide: true },
      { key: "addressLine1", label: "Address line 1", wide: true },
      { key: "addressLine2", label: "Address line 2", wide: true },
      { key: "city", label: "City" },
      {
        key: "stateCode",
        label: "State",
        type: "select",
        options: GST_STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
        hint: "Decides CGST+SGST versus IGST.",
      },
      { key: "pincode", label: "Pincode" },
      { key: "country", label: "Country" },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
      { key: "isActive", label: "Active", type: "checkbox", column: true, hint: "Shown in pickers" },
    ],
    [],
  );

  return (
    <BillingRecordTable
      fields={fields}
      rows={rows}
      searchKey="name"
      noun="Customer"
      canEdit={canEdit}
      onSave={async (id: string | null, values: RecordValues) => {
        const stateCode = String(values.stateCode ?? "");
        const stateName = GST_STATES.find((s) => s.code === stateCode)?.name ?? "";
        return saveBillingCustomer(id, { ...values, stateName });
      }}
    />
  );
}
