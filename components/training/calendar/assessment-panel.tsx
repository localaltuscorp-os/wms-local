"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ShieldOff, ClipboardCheck, AlertTriangle } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { LookupSelect } from "@/components/ui/lookup-select";
import { recordAssessment, waiveAssessment } from "@/app/(app)/training/calendar/actions";
import type { SessionAssessmentRow, SessionAttendeeRow } from "@/lib/queries/training-calendar";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const INPUT = "w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-[15px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600]";

export function AssessmentPanel({
  sessionId,
  assessments,
  attendees,
  passPct,
  canAssess,
}: {
  sessionId: string;
  assessments: SessionAssessmentRow[];
  attendees: SessionAttendeeRow[];
  passPct: number;
  canAssess: boolean;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = React.useState<string | null>(null);
  const [score, setScore] = React.useState<string>("");
  const [target, setTarget] = React.useState<string>("80");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [waivingId, setWaivingId] = React.useState<string | null>(null);

  const empOptions = attendees.map((a) => ({ id: a.employeeId, name: a.employeeName }));

  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!employeeId) return fireToast({ message: "Pick who you're assessing.", type: "error" });
    const sc = Number(score);
    const tg = Number(target);
    if (!Number.isFinite(sc) || sc < 0 || sc > 100) return fireToast({ message: "Score must be 0–100.", type: "error" });
    if (!Number.isFinite(tg) || tg < 0 || tg > 100) return fireToast({ message: "Target must be 0–100.", type: "error" });
    setPending(true);
    const res = await recordAssessment({ sessionId, employeeId, score: sc, target: tg, note: note.trim() || null });
    setPending(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: res.passed ? "Assessment recorded — passed." : "Recorded — below pass, marked to redo.", type: "success" });
    setEmployeeId(null);
    setScore("");
    setNote("");
    router.refresh();
  }

  async function waive(id: string) {
    if (waivingId) return;
    setWaivingId(id);
    const res = await waiveAssessment(id);
    setWaivingId(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Assessment waived.", type: "success" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {assessments.length > 0 ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {assessments.map((a) => {
            const failed = a.passed === false && !a.waived;
            const passed = a.passed === true || a.waived;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <EmployeeAvatar name={a.employeeName} size="sm" />
                <span className="min-w-28 flex-1 text-[14.5px] font-bold text-ink-strong">{a.employeeName}</span>

                <div className="flex items-center gap-2 text-[13px] font-bold tabular-nums">
                  <span className="rounded-lg px-2.5 py-1" style={{ background: "var(--color-surface-track)", color: "var(--color-ink-soft)" }}>
                    {a.score ?? "—"}% <span className="font-semibold text-ink-subtle">/ target {a.target ?? "—"}%</span>
                  </span>
                </div>

                {a.waived ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "var(--color-surface-track)", color: "var(--color-ink-subtle)" }}>
                    <ShieldOff size={13} /> Waived
                  </span>
                ) : passed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}>
                    <Check size={13} strokeWidth={3} /> Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red-deep)" }}>
                    <AlertTriangle size={13} /> Fail — Redo
                  </span>
                )}

                {canAssess && failed && (
                  <button
                    type="button"
                    onClick={() => waive(a.id)}
                    disabled={waivingId === a.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-soft hover:border-ink-subtle disabled:opacity-50"
                  >
                    {waivingId === a.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />} Waive
                  </button>
                )}
                {a.note && <p className="w-full text-[13px] font-medium text-ink-subtle">Note: {a.note}</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[14px] font-semibold text-ink-subtle">No assessments recorded yet.</p>
      )}

      {canAssess && (
        <form onSubmit={record} className="rounded-xl border border-hairline bg-surface-soft p-4">
          <div className="mb-3 flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
            <ClipboardCheck size={15} style={{ color: ACCENT }} /> Record assessment
            <span className="font-semibold normal-case tracking-normal">— below {passPct}% fails &amp; must redo</span>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 max-md:grid-cols-1">
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-subtle">Attendee</label>
              <LookupSelect label="attendee" value={employeeId} onChange={setEmployeeId} options={empOptions} className={INPUT} placeholder="Who?" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-subtle">Score %</label>
              <input type="number" min={0} max={100} className={INPUT} value={score} onChange={(e) => setScore(e.target.value)} placeholder="0–100" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-subtle">Target %</label>
              <input type="number" min={0} max={100} className={INPUT} value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[12px] font-bold text-ink-subtle">Note (optional)</label>
            <input className={INPUT} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the score…" />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <ClipboardCheck size={15} strokeWidth={2.4} />} Record
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
