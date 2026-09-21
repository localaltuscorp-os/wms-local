import { Trash2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { listRecycleBin } from "@/lib/queries/billing-customers";
import { CARD_STYLE } from "@/lib/billing/ui";
import { RecycleBinRow } from "@/components/billing/recycle-bin-row";

/**
 * /billing/recycle-bin — everything removed from the Billing module.
 *
 * Deleted customers, in one list, because "where did that go" is one question.
 * Older rows may also be dropdown options removed before the Billing dropdown
 * editor was retired (2026-09-20); those still restore, they just have no
 * editor to go back to.
 *
 * Nothing in this module deletes a row. Removal writes `deleted_at`, the
 * working lists filter it out, and restoring clears it — so a removal is
 * always recoverable and the audit stays honest.
 */
export const dynamic = "force-dynamic";

export default async function BillingRecycleBinPage() {
  await requireWorkspace("billing");
  const rows = await listRecycleBin();

  return (
    <PageShell width="wide">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Billing</p>
      <h1
        className="mt-1 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(24px,2.8vw,34px)",
          letterSpacing: "-0.025em",
        }}
      >
        Recycle Bin
      </h1>
      <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-muted">
        Customers removed from the Billing module. Nothing here has been destroyed — restoring
        puts it back exactly where it was.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-[22px] p-10 text-center" style={CARD_STYLE}>
          <Trash2 size={26} className="mx-auto text-ink-muted" />
          <p className="mt-2 text-[14px] font-bold text-ink-strong">The bin is empty</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-ink-muted">
            Anything you remove from the Customer Master waits here.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-2">
          {rows.map((r) => (
            <RecycleBinRow key={`${r.kind}:${r.id}`} row={{ ...r, deletedAt: r.deletedAt.toISOString() }} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}
