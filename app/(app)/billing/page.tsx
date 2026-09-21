import { redirect } from "next/navigation";
import type { Route } from "next";

/**
 * BILLING — the room's front door opens on Documents.
 *
 * The page that used to live here surfaced the Google-Sheet revenue ledger
 * ("All Billing Stacked"). Removed from the Billing module on request
 * (2026-09-19); the same ledger is still a tab inside Employees › Incentive.
 * Kept as a redirect so the hub card and any old /billing links still land.
 */
export default function BillingPage() {
  redirect("/billing/documents" as Route);
}
