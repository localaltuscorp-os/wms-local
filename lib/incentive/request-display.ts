import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import { splitMultiValue } from "@/lib/incentive-fields";

/**
 * HOW A REQUEST READS — the three facts a reader looks for on one.
 *
 * A request carries its answers as a jsonb `details` payload, so "who was this
 * for", "who brought it in" and "what did we sell" are key lookups rather than
 * columns. Three surfaces ask those questions — the requests table in the
 * browser, the incentive statement in the PDF, and anything added later — and
 * they must answer them the same way. So the lookups live here, once.
 *
 * Nothing here calculates anything. The names are read from the submitted
 * answers exactly as the employee typed them, and the product codes come from
 * the Product Master through the caller's own name→code map (see
 * `listActiveProductCodes`); a product the admin has not coded prints its name
 * rather than a blank, because a name is still the answer.
 */

/** "Meera Shah" — the first and last name answers joined, blanks dropped. */
export function requestPersonName(
  r: Pick<IncentiveRequestRow, "details">,
  firstKey: string,
  lastKey: string,
): string {
  const d = r.details ?? {};
  return [d[firstKey], d[lastKey]]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** The prospect this request names, or "" when the form has no such answers. */
export function requestProspectName(r: Pick<IncentiveRequestRow, "details">): string {
  return requestPersonName(r, "prospect_first_name", "prospect_last_name");
}

/** The introducer who brought it in, or "". */
export function requestIntroducerName(r: Pick<IncentiveRequestRow, "details">): string {
  return requestPersonName(r, "introducer_first_name", "introducer_last_name");
}

/**
 * The products this request names, as the SHORT codes the Product Master
 * defines — `["PS", "BSS"]`.
 *
 * Both shapes are read: `products` (the multiselect, joined with ", ") and
 * `product` (the single-select older forms use). A name missing from `codes`
 * falls back to the name itself.
 */
export function requestProductCodes(
  r: Pick<IncentiveRequestRow, "details">,
  codes: Record<string, string>,
): string[] {
  const d = r.details ?? {};
  const raw = [d.products, d.product].filter(Boolean).join(", ");
  return [...new Set(splitMultiValue(raw))].map((name) => codes[name] ?? name);
}

/** The same products, by their FULL names — the Product Master's own wording. */
export function requestProductNames(
  r: Pick<IncentiveRequestRow, "details">,
): string[] {
  const d = r.details ?? {};
  const raw = [d.products, d.product].filter(Boolean).join(", ");
  return [...new Set(splitMultiValue(raw))];
}
