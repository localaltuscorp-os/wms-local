"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { refreshSalaryBreakupNow } from "@/app/(app)/salary/sync-actions";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

/**
 * Admin "Sync from sheet" — pulls the LIVE "Altus Corp Salary Payment" Google
 * Sheet into salary_breakup on demand (idempotent, transactional, audit-logged).
 * The returned summary carries counts + unmatched names only (never pay figures),
 * so it's safe to surface verbatim.
 */
export function SalarySyncButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  function sync() {
    setBusy(true);
    startTransition(async () => {
      const res = await refreshSalaryBreakupNow();
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      const s = res.summary;
      const unmatched = s.unmatchedNames.length
        ? ` · ${s.unmatchedNames.length} name${s.unmatchedNames.length === 1 ? "" : "s"} unmatched (${s.unmatchedNames.slice(0, 3).join(", ")}${s.unmatchedNames.length > 3 ? "…" : ""})`
        : "";
      fireToast({
        message: `Synced ${s.rowsUpserted} row${s.rowsUpserted === 1 ? "" : "s"} · ${s.monthsTouched.length} month${s.monthsTouched.length === 1 ? "" : "s"}${unmatched}`,
        type: s.unmatchedNames.length ? "info" : "success",
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={busy}
      title="Pull the latest data from the Altus Corp Salary Payment sheet"
      className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold text-white whitespace-nowrap disabled:opacity-60"
      style={{
        background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
        boxShadow: `0 8px 20px -10px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
      }}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" strokeWidth={2.4} />
      ) : (
        <RefreshCw size={15} strokeWidth={2.4} />
      )}
      {busy ? "Syncing…" : "Sync from Sheet"}
    </button>
  );
}
