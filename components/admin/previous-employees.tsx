"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Archive, Download, ShieldAlert } from "lucide-react";
import {
  EXIT_REASON_LABELS,
  REHIRE_LABELS,
  type ExitReason,
  type RehireEligibility,
} from "@/db/enums";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { getFormerActivity } from "@/app/(admin)/admin/employees/offboarding-actions";

/**
 * PREVIOUS EMPLOYEES — the record that used to be a delete.
 *
 * Everyone here has had their login and photo destroyed; nothing else about
 * them has been. The View more panel surfaces exactly the fields the
 * super-admin chose during the exit flow, which is why it can be trusted as a
 * record rather than a guess: it displays what someone entered, not what the
 * system inferred.
 */

export interface FormerEmployeeView {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  joinedAt: string | null;
  lastWorkingDay: string | null;
  exitReason: ExitReason | null;
  exitReasonOther: string | null;
  rehireEligibility: RehireEligibility | null;
  legalHold: boolean;
  anonymisedAt: string | null;
  archivedAt: string | null;
  successorName: string | null;
  resignationDate: string | null;
  noticeServed: boolean | null;
  noticeDays: number | null;
  paidInLieu: boolean;
  rehireNote: string | null;
  notes: string | null;
  handover: Record<string, unknown> | null;
  reassigned: Record<string, number> | null;
  archivedByName: string | null;
  firebaseDeleted: boolean;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Whole months between two dates, rendered as "2y 4m". */
function tenure(from: string | null, to: string | null): string {
  if (!from) return "—";
  const a = new Date(from);
  const b = to ? new Date(to) : new Date();
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}

const REHIRE_TONE: Record<RehireEligibility, { bg: string; fg: string }> = {
  yes: { bg: "#F0FDF4", fg: "#15803D" },
  no: { bg: "#FEF2F2", fg: "#B91C1C" },
  with_review: { bg: "#FFFBEB", fg: "#92400E" },
};

type ActivityState = {
  windowDays: number | null;
  entries: { at: string; kind: string; eventType: string; detail: string | null }[];
} | null;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-1.5 border-b border-[#F1F5F9] last:border-0">
      <dt className="text-[13px] text-[#64748B] shrink-0">{label}</dt>
      <dd className="text-[13px] text-[#0F172A] font-medium text-right">{value}</dd>
    </div>
  );
}

export function PreviousEmployees({ rows }: { rows: FormerEmployeeView[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [reasonFilter, setReasonFilter] = React.useState<string>("all");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (reasonFilter !== "all" && r.exitReason !== reasonFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.department ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, reasonFilter]);

  const active = filtered.find((r) => r.id === openId) ?? null;

  /**
   * AUDIT LOG for the open person. Loaded on demand rather than with the
   * table: it is three queries per person and nobody opens every row.
   *
   * `windowDays` comes back from the server, not from here — the 60-day
   * default and the super-admin lift are both server decisions, and echoing a
   * client guess would eventually disagree with what was actually returned.
   */
  const [activity, setActivity] = React.useState<ActivityState>(null);
  const [loadingFull, setLoadingFull] = React.useState(false);

  const loadActivity = React.useCallback((id: string, full: boolean) => {
    setLoadingFull(true);
    void getFormerActivity(id, full)
      .then((res) => setActivity(res.ok ? res : null))
      .finally(() => setLoadingFull(false));
  }, []);

  function openPanel(id: string) {
    setOpenId(id);
    setActivity(null);
    loadActivity(id, false);
  }

  // The reason filter offers only reasons that actually occur, so it never
  // shows a bucket that returns nothing. `other` appears as itself, which is
  // the point of having it in the taxonomy at all — the free text lives in a
  // separate column and cannot fragment this list.
  const presentReasons = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.exitReason).filter(Boolean))) as ExitReason[],
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
        <Archive size={22} className="mx-auto text-[#94A3B8] mb-2" />
        <p className="text-[14px] text-[#64748B]">
          No previous employees yet. Anyone offboarded will appear here with
          their exit record.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search previous employees"
          className="flex-1 min-w-[200px] rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] outline-none focus:border-[#0F172A]"
        />
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] outline-none focus:border-[#0F172A]"
        >
          <option value="all">All reasons</option>
          {presentReasons.map((r) => (
            <option key={r} value={r}>
              {EXIT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
        <a
          href="/api/admin/exit-register"
          className="brand-btn inline-flex items-center gap-1.5 px-3 py-2 text-[13.5px] font-medium text-[#334155]"
        >
          <Download size={14} /> Exit register
        </a>
      </div>

      <div className="table-scroll rounded-xl border border-[#E2E8F0] bg-white overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-[#94A3B8]">Name</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-[#94A3B8]">Department</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-[#94A3B8]">Tenure</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-[#94A3B8]">Reason</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-[#94A3B8]">Rehire</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-[#F1F5F9] last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <EmployeeAvatar name={r.name} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-medium text-[#334155]">{r.name}</span>
                        {r.legalHold && (
                          <span title="Legal hold — exempt from retention purges">
                            <ShieldAlert size={13} className="text-[#B45309]" />
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#94A3B8] truncate">{r.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#64748B]">{r.department ?? "—"}</td>
                <td className="px-4 py-3 text-[13px] text-[#64748B] tabular-nums">
                  {tenure(r.joinedAt, r.lastWorkingDay)}
                </td>
                <td className="px-4 py-3 text-[13px] text-[#334155]">
                  {r.exitReason
                    ? r.exitReason === "other"
                      ? (r.exitReasonOther ?? "Other")
                      : EXIT_REASON_LABELS[r.exitReason]
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.rehireEligibility ? (
                    <span
                      className="inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold"
                      style={{
                        background: REHIRE_TONE[r.rehireEligibility].bg,
                        color: REHIRE_TONE[r.rehireEligibility].fg,
                      }}
                    >
                      {REHIRE_LABELS[r.rehireEligibility]}
                    </span>
                  ) : (
                    <span className="text-[#94A3B8]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openPanel(r.id)}
                    className="brand-btn px-3 py-1.5 text-[13px] font-medium text-[#334155]"
                  >
                    View more
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog.Root open={active !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[90]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
            {active && (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <EmployeeAvatar name={active.name} size="md" />
                  <div className="min-w-0">
                    <Dialog.Title className="font-serif text-xl text-[#0F172A]">
                      {active.name}
                    </Dialog.Title>
                    <Dialog.Description className="text-[13px] text-[#64748B] mt-0.5">
                      {active.email} · {active.department ?? "No department"}
                    </Dialog.Description>
                  </div>
                </div>

                {active.legalHold && (
                  <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3 mb-4 text-[13px] text-[#92400E] flex items-start gap-2">
                    <ShieldAlert size={15} className="mt-0.5 shrink-0" />
                    <span>
                      Legal hold in force — this record is exempt from every
                      retention timer and cannot be anonymised.
                    </span>
                  </div>
                )}

                <dl className="mb-4">
                  <Row label="Date of joining" value={fmtDate(active.joinedAt)} />
                  <Row label="Last working day" value={fmtDate(active.lastWorkingDay)} />
                  <Row label="Tenure" value={tenure(active.joinedAt, active.lastWorkingDay)} />
                  <Row
                    label="Reason for leaving"
                    value={
                      active.exitReason
                        ? active.exitReason === "other"
                          ? (active.exitReasonOther ?? "Other")
                          : EXIT_REASON_LABELS[active.exitReason]
                        : "—"
                    }
                  />
                  <Row
                    label="Rehire eligibility"
                    value={
                      active.rehireEligibility
                        ? REHIRE_LABELS[active.rehireEligibility]
                        : "—"
                    }
                  />
                  {active.rehireNote && <Row label="Rehire note" value={active.rehireNote} />}
                  <Row label="Resignation date" value={fmtDate(active.resignationDate)} />
                  <Row
                    label="Notice"
                    value={
                      active.noticeServed === null
                        ? "—"
                        : active.noticeServed
                          ? `Served${active.noticeDays ? ` · ${active.noticeDays} days` : ""}`
                          : active.paidInLieu
                            ? "Paid in lieu"
                            : "Not served"
                    }
                  />
                  <Row label="Work transferred to" value={active.successorName ?? "Nobody"} />
                  <Row label="Offboarded on" value={fmtDate(active.archivedAt)} />
                  <Row label="Offboarded by" value={active.archivedByName ?? "—"} />
                  <Row
                    label="Login"
                    value={
                      active.firebaseDeleted ? (
                        <span className="text-[#15803D]">Deleted</span>
                      ) : (
                        <span className="text-[#B91C1C]">Still exists — remove manually</span>
                      )
                    }
                  />
                </dl>

                {active.notes && (
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 mb-4">
                    <div className="text-[11px] uppercase tracking-wider font-bold text-[#94A3B8] mb-1.5">
                      Notes
                    </div>
                    <p className="text-[13px] text-[#334155]" style={{ lineHeight: 1.6 }}>
                      {active.notes}
                    </p>
                  </div>
                )}

                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] uppercase tracking-wider font-bold text-[#94A3B8]">
                      Activity
                      {activity?.windowDays
                        ? ` · last ${activity.windowDays} days`
                        : activity
                          ? " · full history"
                          : ""}
                    </div>
                    {activity?.windowDays !== null && (
                      <button
                        type="button"
                        onClick={() => loadActivity(active.id, true)}
                        disabled={loadingFull}
                        className="text-[12px] font-semibold text-[#334155] underline underline-offset-2 disabled:opacity-50"
                      >
                        {loadingFull ? "Loading…" : "Show full history"}
                      </button>
                    )}
                  </div>

                  {activity === null ? (
                    <p className="text-[13px] text-[#94A3B8]">Loading activity…</p>
                  ) : activity.entries.length === 0 ? (
                    <p className="text-[13px] text-[#94A3B8]">
                      No recorded activity in this window.
                    </p>
                  ) : (
                    <ul className="slim-scroll space-y-1.5 max-h-56 overflow-y-auto">
                      {activity.entries.map((e, i) => (
                        <li
                          key={`${e.at}-${i}`}
                          className="flex items-baseline justify-between gap-3 text-[12.5px]"
                        >
                          <span className="text-[#334155]">
                            <span className="text-[#94A3B8]">{e.kind}</span>{" "}
                            {e.eventType.replace(/_/g, " ")}
                            {e.detail ? ` — ${e.detail}` : ""}
                          </span>
                          <span className="text-[#94A3B8] tabular-nums shrink-0">
                            {fmtDate(e.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11.5px] text-[#94A3B8] mt-2" style={{ lineHeight: 1.5 }}>
                    Nothing here is ever deleted on exit — this is a view window,
                    not a retention rule.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="brand-btn px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                    >
                      Close
                    </button>
                  </Dialog.Close>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
