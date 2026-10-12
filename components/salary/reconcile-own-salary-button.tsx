"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { reconcileOwnSalaryMonth } from "@/app/(app)/my-salary/actions";
import { fireToast } from "@/lib/toast";

export function ReconcileOwnSalaryButton({ month }: { month: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => startTransition(async () => {
        const result = await reconcileOwnSalaryMonth(month);
        if (!result.ok) {
          fireToast({ message: result.error, type: "error" });
          return;
        }
        fireToast({ message: `Recalculated ${month} salary from attendance.`, type: "success" });
        router.refresh();
      })}
      className="wg-btn inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-card px-3.5 py-2 text-[13px] font-bold text-ink-strong disabled:opacity-60"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
      {busy ? "Recalculating…" : "Recalculate my salary"}
    </button>
  );
}
