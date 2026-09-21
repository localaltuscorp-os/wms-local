/**
 * Types the dummy master needs that would otherwise come from the query layer.
 *
 * `BillableProduct` is the projection the billing form consumes — a few columns
 * off `outstanding_products`, not the whole row. It was declared in
 * lib/queries/billing-documents.ts, and importing it from there put a CYCLE in
 * the graph: queries → lib/billing/master → dummy → queries. Next resolved that
 * cycle by hanging: /billing/documents/new and /admin/billing-profiles both
 * stopped responding (4+ minutes, then nothing), because module evaluation
 * never completed.
 *
 * So the interface lives here, on the side of the cycle that depends on
 * nothing, and the query layer re-exports it — every existing
 * `import { BillableProduct } from "@/lib/queries/billing-documents"` keeps
 * working, and the arrow now points one way only.
 */

/** The billing columns of a product, as the form's dropdown reads them. */
export interface BillableProduct {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  sacCode: string | null;
  defaultRate: string | null;
  defaultGstRate: string | null;
}
