import Link from "next/link";
import { Tags } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { listVendorCategories } from "@/lib/queries/ops-vendors";
import { VendorCategoryMaster } from "@/components/operations/directory/vendor-category-master";

export const dynamic = "force-dynamic";

/** Management is separate from the all-employee Directory read view. */
export default async function VendorCategoryMasterPage() {
  const me = await requireUser();
  const canManage = await isHrStaff(me);
  if (!canManage) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl rounded-2xl border border-hairline bg-white px-8 py-12 text-center">
          <h1 className="text-[20px] font-bold text-ink-strong">Vendor Category Master</h1>
          <p className="mt-2 text-[14px] text-ink-muted">You can view the Vendor Directory, but only HR staff and super-admins can manage its categories.</p>
          <Link href="/operations/directory" className="mt-5 inline-flex rounded-lg border border-hairline-strong px-4 py-2 text-[13px] font-bold text-ink-strong">Back to Directory</Link>
        </div>
      </PageShell>
    );
  }
  const categories = await listVendorCategories();
  return (
    <PageShell>
      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-soft text-altus-red"><Tags className="h-5 w-5" /></span>
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Vendor Category Master</h1>
          <p className="text-[13px] text-ink-muted">The source of truth for Vendor Directory and its bulk-upload template.</p>
        </div>
      </header>
      <VendorCategoryMaster categories={categories} />
    </PageShell>
  );
}
