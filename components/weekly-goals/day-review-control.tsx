"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { reviewChecklistDay } from "@/app/(app)/goals/weekly/team/[id]/actions";

/** Per-day approve / needs-rework control shown on a member's checklist review. */
export function DayReviewControl({
  employeeId,
  planDate,
  status,
  note,
}: {
  employeeId: string;
  planDate: string;
  status: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [noteVal, setNoteVal] = React.useState(note ?? "");

  function submit(next: "approved" | "needs_rework") {
    start(async () => {
      const res = await reviewChecklistDay({ employeeId, planDate, status: next, note: noteVal });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: next === "approved" ? "Day approved." : "Marked needs rework.", type: "success" });
      router.refresh();
    });
  }

  const approved = status === "approved";
  const rework = status === "needs_rework";

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={noteVal}
        onChange={(e) => setNoteVal(e.target.value)}
        placeholder="Review note (optional)…"
        className="min-w-0 flex-1 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[13px] text-ink-strong outline-none focus:border-altus-red"
      />
      <button
        type="button"
        onClick={() => submit("approved")}
        disabled={pending}
        className="brand-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
        style={{ background: approved ? "#15803d" : "linear-gradient(135deg, var(--color-green), var(--color-green-deep))" }}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
        {approved ? "Approved" : "Approve"}
      </button>
      <button
        type="button"
        onClick={() => submit("needs_rework")}
        disabled={pending}
        className="brand-btn inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-[13px] font-bold disabled:opacity-50"
        style={{ borderColor: rework ? "#d97706" : "var(--color-hairline-strong)", color: rework ? "#b45309" : "var(--color-ink-soft)" }}
      >
        <RotateCcw size={14} strokeWidth={2.4} /> {rework ? "Needs rework" : "Rework"}
      </button>
    </div>
  );
}
