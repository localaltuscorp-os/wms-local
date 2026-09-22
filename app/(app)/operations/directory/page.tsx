import { BookUser } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { isHrStaff } from "@/lib/hr/access";
import { isMissingVendorTable, listVendors } from "@/lib/queries/ops-vendors";
import { VendorDirectory } from "@/components/operations/directory/vendor-directory";

export const dynamic = "force-dynamic";

const ACCENT_DEEP = "#A80400";

/**
 * OPERATIONS → Directory. Every outside vendor Altus Corp works with — contact,
 * postal address, website and AMC. Everyone in Operations can view; Ruchita,
 * Rutvisha and Manan can add, edit and bulk-upload.
 */
export default async function OperationsDirectoryPage() {
  const me = await requireWorkspace("operations");
  // Hiding the controls is a courtesy; the actions ask the same question again.
  const canEdit = await isHrStaff(me);

  let vendors;
  try {
    vendors = await listVendors();
  } catch (e) {
    if (!isMissingVendorTable(e)) throw e;
    return <DirectorySetupNeeded />;
  }

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#FEE2E2", color: ACCENT_DEEP }}>
          <BookUser className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Directory</h1>
          <p className="text-[13px] text-ink-muted">Every Altus Corp vendor - contact, postal address, website and AMC.</p>
        </div>
      </header>
      <VendorDirectory vendors={vendors} canEdit={canEdit} />
    </PageShell>
  );
}

/** Shown when 0228 has not been applied — actionable, not a stack trace. */
function DirectorySetupNeeded() {
  return (
    <PageShell>
      <div className="mx-auto max-w-xl rounded-2xl border border-hairline bg-white px-8 py-12 text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "#FEE2E2", color: ACCENT_DEEP }}>
          <BookUser className="h-7 w-7" />
        </span>
        <h1 className="text-[20px] font-bold text-ink-strong">The Directory needs its database table</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          Migration 0228 has not been applied yet. Run{" "}
          <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[13px]">db/migrations/0228_ops_vendor_directory.sql</code>{" "}
          in Supabase (SQL Editor) or with <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[13px]">pnpm db:migrate</code>. This page works as soon as it completes.
        </p>
      </div>
    </PageShell>
  );
}
