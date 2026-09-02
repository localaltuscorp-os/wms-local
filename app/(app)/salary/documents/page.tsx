import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * Exit documents moved onto the HR Letters page (Phase 4 — one HR document
 * home). This route is kept as a thin permanent redirect so old links / nav
 * entries keep working. The generate PDF endpoint (/salary/documents/pdf) is
 * unchanged and still used by the builder in its new home.
 */
export default async function SalaryDocumentsPage() {
  redirect("/letters" as Route);
}
