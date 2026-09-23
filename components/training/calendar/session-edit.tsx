"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Ban, CheckCircle2, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { SessionForm, type SessionFormValues } from "@/components/training/calendar/session-form";
import { cancelSession, transitionSession } from "@/app/(app)/training/calendar/actions";
import type { SessionStatus } from "@/lib/queries/training-calendar";

const ACCENT = "#E10600";

/** The next legal lifecycle steps from each status (spec §7). */
const NEXT: Record<string, { to: SessionStatus; label: string }[]> = {
  draft: [{ to: "scheduled", label: "Schedule" }, { to: "cancelled", label: "Cancel" }],
  scheduled: [
    { to: "live", label: "Go Live" },
    { to: "rescheduled", label: "Reschedule" },
    { to: "done", label: "Complete" },
    { to: "cancelled", label: "Cancel" },
  ],
  live: [{ to: "done", label: "Complete" }, { to: "cancelled", label: "Cancel" }],
  done: [{ to: "completed", label: "Mark Completed" }, { to: "test_pending", label: "Test Pending" }, { to: "feedback_pending", label: "Feedback Pending" }],
  completed: [{ to: "test_pending", label: "Test Pending" }, { to: "feedback_pending", label: "Feedback Pending" }, { to: "closed", label: "Close" }],
  test_pending: [{ to: "feedback_pending", label: "Feedback Pending" }, { to: "closed", label: "Close" }],
  feedback_pending: [{ to: "closed", label: "Close" }],
  rescheduled: [{ to: "scheduled", label: "Schedule" }],
};

type AddSubject = (name: string) => Promise<{ ok: true; option: { id: string; name: string } } | { ok: false; error: string }>;

/** Trainer/admin controls on the session detail page: edit (inline form),
 *  mark done, cancel. */
export function SessionEdit({
  initial,
  status,
  subjectOptions,
  employeeOptions,
  maxSessionMinutes,
  onAddSubject,
}: {
  initial: SessionFormValues;
  status: SessionStatus;
  subjectOptions: { id: string; name: string }[];
  employeeOptions: { id: string; name: string }[];
  maxSessionMinutes: number;
  onAddSubject?: AddSubject;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function onCancel() {
    if (!confirm("Cancel this session? Attendees keep their records but it's marked cancelled.")) return;
    setBusy("cancel");
    const res = await cancelSession(initial.id!);
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Session cancelled.", type: "success" });
    router.refresh();
  }
  async function onTransition(to: SessionStatus) {
    setBusy(`to:${to}`);
    const res = await transitionSession(initial.id!, to);
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: `Moved to ${to}.`, type: "success" });
    router.refresh();
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm max-md:p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-ink-strong">Edit Session</h3>
          <button type="button" onClick={() => setEditing(false)} aria-label="Close" className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft">
            <X size={18} />
          </button>
        </div>
        <SessionForm
          mode="edit"
          initial={initial}
          subjectOptions={subjectOptions}
          employeeOptions={employeeOptions}
          maxSessionMinutes={maxSessionMinutes}
          onAddSubject={onAddSubject}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-bold transition-colors"
        style={{ borderColor: ACCENT, color: ACCENT }}
      >
        <Pencil size={15} /> Edit Session
      </button>
      {(NEXT[status] ?? []).map((step) => (
        <button
          key={step.to}
          type="button"
          onClick={() => onTransition(step.to)}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-soft hover:border-ink-subtle disabled:opacity-50"
        >
          {busy === `to:${step.to}` ? <Loader2 size={15} className="animate-spin" /> : step.to === "cancelled" ? <Ban size={15} /> : <CheckCircle2 size={15} />} {step.label}
        </button>
      ))}
      {status !== "cancelled" && !(NEXT[status] ?? []).some((s) => s.to === "cancelled") && (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red disabled:opacity-50"
        >
          {busy === "cancel" ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Cancel
        </button>
      )}
    </div>
  );
}
