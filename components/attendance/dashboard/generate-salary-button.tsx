"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { generateSalary } from "@/app/(app)/salary/actions";

/**
 * "Generate Salary" from the attendance report — computes a salary run per
 * employee for the displayed month (CTC × payable-days from the synced
 * attendance, minus PT/advances) and writes salary_runs (idempotent; existing
 * runs never clobbered; employees without a CTC profile are skipped).
 */
export function GenerateSalaryButton({ year, month, label }: { year: number; month: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  function run() {
    if (busy) return;
    if (!window.confirm(`Generate salary runs for ${label} from the attendance?\n\nExisting runs are never overwritten; employees without a CTC are skipped.`)) return;
    setBusy(true);
    generateSalary({ month: ym }).then((res) => {
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Generated ${res.generated} salary run${res.generated === 1 ? "" : "s"} for ${label}.`, type: "success" });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title={`Generate salary runs for ${label}`}
      className="brand-btn wg-btn wg-sheen inline-flex items-center gap-1.5 rounded-full py-2 px-4 text-[13.5px] font-bold text-white disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 8px 20px -10px color-mix(in srgb, var(--color-altus-red-deep) 70%, transparent)" }}
    >
      {busy ? <Loader2 size={15} className="animate-spin" strokeWidth={2.4} /> : <Wallet size={15} strokeWidth={2.2} />}
      {busy ? "Generating…" : "Generate Salary"}
    </button>
  );
}
