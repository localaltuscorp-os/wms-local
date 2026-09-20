"use client";

import {
  BillingRecordTable,
  type FieldSpec,
  type RecordRow,
} from "@/components/admin/billing/record-table";
import {
  saveBillingPaymentTerm,
  saveBillingSacCode,
} from "@/app/(admin)/admin/billing-payment-terms/actions";
import { saveProductBillingFields } from "@/app/(admin)/admin/billing-profiles/actions";

/**
 * The three small billing masters, each one a field list over the shared record
 * table: payment terms, SAC codes, and the billing columns of the product
 * master. Writing them as data rather than as three near-identical screens is
 * what keeps them looking and behaving the same.
 */

const TERM_FIELDS: FieldSpec[] = [
  { key: "label", label: "Label", column: true, placeholder: "30 Days" },
  {
    key: "dueDays",
    label: "Due days",
    type: "number",
    column: true,
    hint: "Blank when there is no computable due date (e.g. against documents).",
  },
  { key: "isDefault", label: "Default", type: "checkbox", column: true, hint: "Pre-selected on a new document" },
  { key: "isActive", label: "Active", type: "checkbox", column: true, hint: "Offered in pickers" },
  { key: "sortOrder", label: "Sort order", type: "number" },
];

export function PaymentTermRoster({ rows, canEdit }: { rows: RecordRow[]; canEdit: boolean }) {
  return (
    <BillingRecordTable
      fields={TERM_FIELDS}
      rows={rows}
      searchKey="label"
      noun="Payment term"
      canEdit={canEdit}
      onSave={(id, values) => saveBillingPaymentTerm(id, values)}
    />
  );
}

const SAC_FIELDS: FieldSpec[] = [
  { key: "code", label: "SAC code", column: true, placeholder: "998311" },
  { key: "description", label: "Description", column: true, wide: true },
  { key: "defaultGstRate", label: "Default GST %", type: "number", column: true, placeholder: "18" },
  { key: "isActive", label: "Active", type: "checkbox", column: true, hint: "Offered in pickers" },
  { key: "sortOrder", label: "Sort order", type: "number" },
];

export function SacCodeRoster({ rows, canEdit }: { rows: RecordRow[]; canEdit: boolean }) {
  return (
    <BillingRecordTable
      fields={SAC_FIELDS}
      rows={rows}
      searchKey="code"
      noun="SAC code"
      canEdit={canEdit}
      onSave={(id, values) => saveBillingSacCode(id, values)}
    />
  );
}

const PRODUCT_FIELDS: FieldSpec[] = [
  { key: "name", label: "Product", column: true },
  { key: "code", label: "Code", column: true },
  { key: "sacCode", label: "SAC code", column: true, placeholder: "998311" },
  { key: "defaultRate", label: "Default rate", type: "number", column: true },
  { key: "defaultGstRate", label: "Default GST %", type: "number", column: true, placeholder: "18" },
  { key: "description", label: "Description", type: "textarea", wide: true },
  {
    key: "isBillable",
    label: "Billable",
    type: "checkbox",
    column: true,
    hint: "Offered on invoices",
  },
];

/**
 * The product master's BILLING columns only. Names and codes stay on
 * `/admin/products` — this screen writes the same `outstanding_products` rows
 * through the same cache tag, it does not fork the master.
 */
export function ProductBillingRoster({ rows, canEdit }: { rows: RecordRow[]; canEdit: boolean }) {
  return (
    <BillingRecordTable
      fields={PRODUCT_FIELDS.map((f) =>
        f.key === "name" || f.key === "code" ? { ...f, hint: "Edited on Admin › Products" } : f,
      )}
      rows={rows}
      searchKey="name"
      noun="Product"
      canEdit={canEdit}
      onSave={(id, values) => saveProductBillingFields(id, values)}
    />
  );
}
