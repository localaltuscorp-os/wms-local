"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { generateSalary } from "@/app/(app)/salary/actions";
import { fireToast } from "@/lib/toast";

interface Props {
  month: string;
  monthLabel: string;
}

/**
 * Recompute the selected month's canonical salary runs from attendance and
 * mirror them to salary_breakup, which is what the Accounts table reads.
 * The server action preserves payment history and manual adjustment overlays.
 */
export function SalaryAttendanceRefreshButton({ month, monthLabel }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  function refresh() {
    if (
      !window.confirm(
        `Refresh ${monthLabel} salary from the latest attendance?\n\n` +
          "This recalculates salary amounts everywhere. Recorded payments and manual adjustments are preserved.",
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await generateSalary({ month });
      if (!result.ok) {
        fireToast({ message: result.error, type: "error" });
        return;
      }
      fireToast({
        message: `Refreshed ${result.generated} salary ${result.generated === 1 ? "record" : "records"} for ${monthLabel}.`,
        type: "success",
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      title="Recalculate this month from attendance and update all salary views"
      className="wg-btn inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-card px-3.5 py-2 text-[13px] font-bold text-ink-strong transition hover:bg-surface-subtle disabled:opacity-60"
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" strokeWidth={2.3} />
      ) : (
        <RefreshCw size={15} strokeWidth={2.3} />
      )}
      {busy ? "Refreshing…" : "Refresh from Attendance"}
    </button>
  );
}
