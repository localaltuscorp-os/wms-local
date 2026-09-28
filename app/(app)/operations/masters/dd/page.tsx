import { ListFilter } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { MastersHeader } from "@/components/operations/masters/masters-header";
import { listDdCategories, isMissingDdTable, type DdCategory } from "@/lib/queries/dd-options";
import { DdMaster } from "@/components/operations/masters/dd-master";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → MASTERS → DD Master.
 *
 * The dropdown-options registry: one tab per category (Batch Number,
 * Handholding Calls, Product Names, …), each option shown as a boxed item
 * that can be retired. Viewing is open to the room; adding a category,
 * adding an option and retiring one are admin-only — re-checked server-side
 * in ./actions.ts, not just hidden here.
 */
export default async function DdMasterPage() {
  const me = await requireWorkspace("operations");
  const canEdit = me.isAdmin || isSuperAdmin(me.email);

  let categories: DdCategory[] = [];
  let missing = false;
  try {
    categories = await listDdCategories();
  } catch (e) {
    if (!isMissingDdTable(e)) throw e;
    missing = true;
  }

  return (
    <PageShell>
      <MastersHeader
        Icon={ListFilter}
        topic="Dropdowns"
        title="DD Master"
      />
      {missing ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-[14px] text-slate-500">
          DD Master's table is not set up yet (migration 0245).
        </p>
      ) : (
        <DdMaster categories={categories} canEdit={canEdit} />
      )}
    </PageShell>
  );
}
