import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { PortalScreen } from "@/components/portal/portal-screen";

// Personal, per-request data (payslips / signed docs). Never cache a copy that
// could leak between users on a shared browser session.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My HR Record · Altus",
  description: "Your documents, policies, salary slips, certificate and submitted forms — all in one place.",
};

/**
 * EMPLOYEE SELF-SERVICE PORTAL (`/portal`).
 *
 * Employee-facing: every authenticated employee sees ONLY their own data. The
 * server component resolves the current employee for the greeting; the client
 * `PortalScreen` calls the three per-`me.id` loaders (getMyDocuments /
 * getMyPolicies / getMyPayslips) and renders My Documents, My Policies and
 * Salary Slips with full loading / empty / error states.
 */
export default async function PortalPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;
  return <PortalScreen firstName={firstName} fullName={me.name} />;
}
