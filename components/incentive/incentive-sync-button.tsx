"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { syncIncentivesFromSheets } from "@/app/(app)/incentive/actions";

/** Admin button — pull Qualified Leads + Referrals from the Sheets endpoint. */
export function IncentiveSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function sync() {
    start(async () => {
      const res = await syncIncentivesFromSheets();
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      const r = res.result;
      fireToast({
        message: `Synced — ${r.created} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped` : ""}.`,
        type: "success",
      });
      if (r.warnings.length > 0) {
        fireToast({ message: r.warnings[0]!, type: "info" });
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={pending}
      title="Pull Qualified Leads & Referrals from the Sheets and recompute"
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold border border-hairline bg-surface-card text-ink-strong hover:brightness-95 transition-all disabled:opacity-60"
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />}
      Sync from Sheets
    </button>
  );
}
