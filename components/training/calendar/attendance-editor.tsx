"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { setAttendance } from "@/app/(app)/training/calendar/actions";
import type { SessionAttendeeRow } from "@/lib/queries/training-calendar";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

type AttStatus = SessionAttendeeRow["status"];

const STATUS_META: Record<AttStatus, { label: string; color: string; bg: string }> = {
  invited: { label: "Invited", color: "var(--color-ink-soft)", bg: "var(--color-surface-track)" },
  attended: { label: "Attended", color: "var(--color-green-deep)", bg: "color-mix(in srgb, var(--color-green) 14%, transparent)" },
  left_halfway: { label: "Left Halfway", color: "#b45309", bg: "rgba(245,158,11,0.16)" },
  absent: { label: "Absent", color: "var(--color-altus-red-deep)", bg: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)" },
};

const ORDER: AttStatus[] = ["invited", "attended", "left_halfway", "absent"];

interface Row {
  employeeId: string;
  employeeName: string;
  status: AttStatus;
  attendedMin: number | null;
}

export function AttendanceEditor({
  sessionId,
  attendees,
  durationMin,
  canMark,
}: {
  sessionId: string;
  attendees: SessionAttendeeRow[];
  durationMin: number;
  canMark: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>(
    attendees.map((a) => ({ employeeId: a.employeeId, employeeName: a.employeeName, status: a.status, attendedMin: a.attendedMin })),
  );
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setRows(attendees.map((a) => ({ employeeId: a.employeeId, employeeName: a.employeeName, status: a.status, attendedMin: a.attendedMin })));
    setDirty(false);
  }, [attendees]);

  function setStatus(id: string, status: AttStatus) {
    setDirty(true);
    setRows((prev) =>
      prev.map((r) =>
        r.employeeId === id
          ? {
              ...r,
              status,
              attendedMin:
                status === "attended" ? r.attendedMin ?? durationMin : status === "left_halfway" ? r.attendedMin ?? Math.round(durationMin / 2) : null,
            }
          : r,
      ),
    );
  }

  function setMinutes(id: string, min: number) {
    setDirty(true);
    setRows((prev) => prev.map((r) => (r.employeeId === id ? { ...r, attendedMin: Number.isFinite(min) ? min : null } : r)));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const res = await setAttendance({
      sessionId,
      rows: rows.map((r) => ({ employeeId: r.employeeId, status: r.status, attendedMin: r.attendedMin })),
    });
    setSaving(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setDirty(false);
    fireToast({ message: "Attendance saved.", type: "success" });
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-[14px] font-semibold text-ink-subtle">No attendees on this session yet. Edit the session to invite people.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-hairline">
        {rows.map((r) => {
          const meta = STATUS_META[r.status];
          const showMin = r.status === "attended" || r.status === "left_halfway";
          return (
            <li key={r.employeeId} className="flex flex-wrap items-center gap-3 py-3">
              <EmployeeAvatar name={r.employeeName} size="sm" />
              <span className="min-w-32 flex-1 text-[14.5px] font-bold text-ink-strong">{r.employeeName}</span>

              {canMark ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {ORDER.map((s) => {
                    const active = r.status === s;
                    const m = STATUS_META[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(r.employeeId, s)}
                        className="rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold transition-colors"
                        style={{
                          borderColor: active ? "transparent" : "var(--color-hairline)",
                          background: active ? m.bg : "white",
                          color: active ? m.color : "var(--color-ink-subtle)",
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="rounded-lg px-2.5 py-1 text-[12.5px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
              )}

              {showMin && (
                <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-subtle">
                  <input
                    type="number"
                    min={0}
                    max={600}
                    disabled={!canMark}
                    value={r.attendedMin ?? ""}
                    onChange={(e) => setMinutes(r.employeeId, Number(e.target.value))}
                    className="w-16 rounded-lg border border-hairline bg-white px-2 py-1.5 text-[13px] font-bold text-ink-strong outline-none focus:border-[#E10600] disabled:opacity-60"
                    aria-label={`Minutes attended by ${r.employeeName}`}
                  />
                  min
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {canMark && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-[12.5px] font-semibold text-ink-subtle">Unsaved changes</span>}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="brand-btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.6} />}
            Save Attendance
          </button>
        </div>
      )}
    </div>
  );
}
