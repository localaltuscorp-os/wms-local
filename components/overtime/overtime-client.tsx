"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Check,
  X,
  Trash2,
  Timer,
  CalendarDays,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  logOvertime,
  approveOvertime,
  rejectOvertime,
  deleteOvertime,
} from "@/app/(app)/overtime/actions";
import type { OvertimeRow, OvertimeStatus } from "@/lib/queries/overtime";
import { formatDate } from "@/lib/format";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

const FIELD =
  "w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-[#16a34a] focus-visible:border-[#16a34a]";
const LABEL =
  "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

const STATUS_META: Record<
  OvertimeStatus,
  { bg: string; fg: string; stripe: string; label: string }
> = {
  pending: {
    bg: "rgba(245,158,11,0.12)",
    fg: "#B45309",
    stripe: "#F59E0B",
    label: "Pending",
  },
  approved: {
    bg: "rgba(22,163,74,0.12)",
    fg: "#15803D",
    stripe: "#16A34A",
    label: "Approved",
  },
  rejected: {
    bg: "rgba(225,6,0,0.10)",
    fg: "#A80400",
    stripe: "var(--color-altus-red)",
    label: "Rejected",
  },
};

function fmtDate(iso: string): string {
  return formatDate(iso);
}

function fmtHours(n: number): string {
  return `${n.toFixed(n % 1 === 0 ? 0 : 2)}h`;
}

function StatusChip({ status }: { status: OvertimeStatus }) {
  const s = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-bold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export interface OvertimeClientProps {
  rows: OvertimeRow[];
  meId: string;
  /** People the viewer may log overtime FOR (self + downline, or everyone). */
  loggableFor: { id: string; name: string }[];
  /** Whether the viewer can approve/reject (admin or a manager with reports). */
  canReview: boolean;
  todayISO: string;
}

type StatusFilter = "all" | OvertimeStatus;
type SortKey = "date" | "hours";

export function OvertimeClient({
  rows,
  meId,
  loggableFor,
  canReview,
  todayISO,
}: OvertimeClientProps) {
  const router = useRouter();

  const canPickPerson = loggableFor.length > 1;
  const [employeeId, setEmployeeId] = React.useState<string>(meId);
  const [workDate, setWorkDate] = React.useState<string>(todayISO);
  const [hours, setHours] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // ── Client-side search / filter / sort (presentation only) ──
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("date");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const counts = React.useMemo(() => {
    const c = { all: rows.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    if (q) {
      out = out.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          (r.reason ?? "").toLowerCase().includes(q) ||
          fmtDate(r.workDate).toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) =>
      sortKey === "hours"
        ? (a.hours - b.hours) * dir
        : a.workDate.localeCompare(b.workDate) * dir,
    );
  }, [rows, query, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      setError("Enter hours between 0 and 24.");
      document.getElementById("ot-hours")?.focus();
      return;
    }
    setSubmitting(true);
    const res = await logOvertime({
      employeeId: employeeId !== meId ? employeeId : undefined,
      workDate,
      hours: h,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Overtime logged.", type: "success" });
    setHours("");
    setReason("");
    setWorkDate(todayISO);
    setEmployeeId(meId);
    router.refresh();
  }

  async function act(
    id: string,
    fn: (i: { id: string }) => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    setBusyId(id);
    const res = await fn({ id });
    setBusyId(null);
    if (!res.ok) {
      fireToast({ message: res.error ?? "Action failed.", type: "error" });
      return;
    }
    fireToast({ message: okMsg, type: "success" });
    router.refresh();
  }

  const filterPill = (key: StatusFilter, label: string, count: number) => {
    const active = statusFilter === key;
    const meta = key !== "all" ? STATUS_META[key] : null;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setStatusFilter(key)}
        aria-pressed={active}
        className="wg-btn cursor-pointer rounded-pill px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap tabular-nums"
        style={
          active
            ? meta
              ? {
                  background: meta.bg,
                  color: meta.fg,
                  boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${meta.stripe} 55%, transparent)`,
                }
              : {
                  background: "var(--color-ink-strong, #0F172A)",
                  color: "#fff",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                }
            : {
                background: "var(--color-surface-card)",
                color: "var(--color-ink-soft)",
                boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
              }
        }
      >
        {label} · {count}
      </button>
    );
  };

  const sortBtn = (key: SortKey, label: string) => {
    const active = sortKey === key;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggleSort(key)}
        aria-label={`Sort by ${label}`}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors hover:bg-surface-soft"
        style={{
          color: active ? GREEN_DEEP : "var(--color-ink-soft)",
          boxShadow: active
            ? `inset 0 0 0 1.5px color-mix(in srgb, ${GREEN} 45%, transparent)`
            : "inset 0 0 0 1px var(--color-hairline-strong)",
          background: active
            ? `color-mix(in srgb, ${GREEN} 7%, transparent)`
            : "var(--color-surface-card)",
        }}
      >
        <Icon size={13} strokeWidth={2.6} />
        {label}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-6 max-lg:grid-cols-1">
      {/* ── Log form ─────────────────────────────────────────────────── */}
      <form
        onSubmit={onSubmit}
        className="wg-rise relative h-fit overflow-hidden rounded-[22px] bg-surface-card p-6 max-md:p-5 lg:sticky lg:top-6"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${GREEN} 8%, transparent), transparent 60%)`,
          }}
        />
        <div className="relative mb-5 flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{
              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
              boxShadow: `0 8px 18px -8px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)`,
            }}
          >
            <Timer size={18} strokeWidth={2.4} />
          </span>
          <div>
            <h2
              className="font-bold text-ink-strong"
              style={{ fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.1 }}
            >
              Log Overtime
            </h2>
            <p className="text-[12.5px] font-medium text-ink-subtle">
              Lands as pending until reviewed.
            </p>
          </div>
        </div>

        <div className="relative flex flex-col gap-4">
          {canPickPerson && (
            <div>
              <label htmlFor="ot-employee" className={LABEL}>
                Employee
              </label>
              <select
                id="ot-employee"
                className={FIELD}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {loggableFor.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === meId ? `${p.name} (me)` : p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="ot-date" className={LABEL}>
              Work date <span style={{ color: "var(--color-altus-red)" }}>*</span>
            </label>
            <input
              id="ot-date"
              type="date"
              required
              max={todayISO}
              className={FIELD}
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="ot-hours" className={LABEL}>
              Hours <span style={{ color: "var(--color-altus-red)" }}>*</span>
            </label>
            <input
              id="ot-hours"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0.25"
              max="24"
              required
              placeholder="e.g. 2.5"
              autoFocus
              className={FIELD}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="ot-reason" className={LABEL}>
              Reason
            </label>
            <textarea
              id="ot-reason"
              rows={3}
              placeholder="What was the extra work for?"
              className={FIELD + " resize-none"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[13px] font-semibold"
              role="alert"
              style={{ background: "rgba(225,6,0,0.08)", color: "#A80400" }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="brand-btn wg-btn wg-sheen inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill py-3 px-5 text-[15px] font-bold text-white disabled:opacity-60"
            style={{
              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
              boxShadow: `0 12px 30px -12px color-mix(in srgb, ${GREEN_DEEP} 75%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
            }}
          >
            {submitting ? (
              <Loader2 size={17} strokeWidth={2.6} className="animate-spin" />
            ) : (
              <Plus size={17} strokeWidth={2.6} />
            )}
            Log Overtime
          </button>
        </div>
      </form>

      {/* ── Requests list ────────────────────────────────────────────── */}
      <section
        className="wg-rise overflow-hidden rounded-[22px] bg-surface-card"
        style={{ boxShadow: CARD_SHADOW, animationDelay: "60ms" }}
        aria-label="Overtime requests"
      >
        {/* Toolbar: search + status pills + sort */}
        <div
          className="flex flex-wrap items-center gap-2.5 border-b px-5 py-4 max-md:px-4"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          <div className="relative min-w-[190px] flex-1 max-w-[300px]">
            <Search
              size={15}
              strokeWidth={2.4}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={canReview ? "Search person, reason, date…" : "Search reason or date…"}
              aria-label="Search overtime entries"
              className="w-full rounded-pill border border-hairline-strong bg-white py-2 pl-9 pr-3.5 text-[13.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-[#16a34a]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
            {filterPill("all", "All", counts.all)}
            {filterPill("pending", "Pending", counts.pending)}
            {filterPill("approved", "Approved", counts.approved)}
            {filterPill("rejected", "Rejected", counts.rejected)}
          </div>
          <div className="ml-auto flex items-center gap-1.5 max-md:ml-0">
            {sortBtn("date", "Date")}
            {sortBtn("hours", "Hours")}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <span
              className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl"
              style={{
                background: `color-mix(in srgb, ${GREEN} 9%, transparent)`,
                color: GREEN_DEEP,
              }}
            >
              <CalendarDays size={22} strokeWidth={2} />
            </span>
            <p className="font-bold text-ink-strong" style={{ fontSize: 16 }}>
              No overtime logged yet.
            </p>
            <p className="mt-1 font-medium text-ink-subtle" style={{ fontSize: 14 }}>
              Use the form to log your first entry.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-bold text-ink-strong" style={{ fontSize: 15 }}>
              No entries match.
            </p>
            <p className="mt-1 font-medium text-ink-subtle" style={{ fontSize: 13.5 }}>
              Try a different search or status filter.
            </p>
          </div>
        ) : (
          <ul>
            {visible.map((r) => {
              const canDelete =
                canReview || (r.employeeId === meId && r.status === "pending");
              const busy = busyId === r.id;
              const meta = STATUS_META[r.status];
              return (
                <li
                  key={r.id}
                  className="relative flex items-start gap-3.5 border-b px-5 py-3.5 transition-colors last:border-0 hover:bg-surface-soft/60 max-md:flex-wrap max-md:px-4"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  {/* Status stripe */}
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-[3px] rounded-r-full"
                    style={{ background: meta.stripe }}
                  />

                  {canReview && (
                    <EmployeeAvatar name={r.employeeName} size="sm" className="mt-0.5" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {canReview && (
                        <span className="truncate text-[14.5px] font-semibold text-ink-strong">
                          {r.employeeName}
                        </span>
                      )}
                      <span
                        className={
                          canReview
                            ? "text-[12.5px] font-semibold text-ink-subtle whitespace-nowrap tabular-nums"
                            : "text-[14.5px] font-semibold text-ink-strong whitespace-nowrap tabular-nums"
                        }
                      >
                        {fmtDate(r.workDate)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13.5px] font-medium text-ink-muted break-words">
                      {r.reason || <span className="text-ink-subtle">No reason given</span>}
                    </p>
                    {r.note && (
                      <p className="mt-0.5 text-[12px] font-medium text-ink-subtle">
                        Note: {r.note}
                      </p>
                    )}
                  </div>

                  {/* Hours pill */}
                  <span
                    className="mt-0.5 inline-flex shrink-0 items-center rounded-pill px-2.5 py-1 text-[13px] font-bold tabular-nums whitespace-nowrap"
                    style={{
                      background: `color-mix(in srgb, ${GREEN} 10%, transparent)`,
                      color: GREEN_DEEP,
                    }}
                  >
                    {fmtHours(r.hours)}
                  </span>

                  {/* Status */}
                  <div className="mt-0.5 flex shrink-0 flex-col items-end gap-0.5">
                    <StatusChip status={r.status} />
                    {r.approvedByName && (
                      <span className="text-[11.5px] font-medium text-ink-subtle whitespace-nowrap">
                        by {r.approvedByName}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                    {canReview && r.status !== "approved" && (
                      <button
                        type="button"
                        title="Approve"
                        aria-label={`Approve overtime for ${r.employeeName} on ${fmtDate(r.workDate)}`}
                        disabled={busy}
                        onClick={() => act(r.id, approveOvertime, "Overtime approved.")}
                        className="wg-btn grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-colors disabled:opacity-50"
                        style={{
                          background: "rgba(22,163,74,0.10)",
                          color: GREEN_DEEP,
                          boxShadow: "inset 0 0 0 1px rgba(22,163,74,0.28)",
                        }}
                      >
                        {busy ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Check size={16} strokeWidth={2.6} />
                        )}
                      </button>
                    )}
                    {canReview && r.status !== "rejected" && (
                      <button
                        type="button"
                        title="Reject"
                        aria-label={`Reject overtime for ${r.employeeName} on ${fmtDate(r.workDate)}`}
                        disabled={busy}
                        onClick={() => act(r.id, rejectOvertime, "Overtime rejected.")}
                        className="wg-btn grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-colors disabled:opacity-50"
                        style={{
                          background: "rgba(225,6,0,0.07)",
                          color: "#A80400",
                          boxShadow: "inset 0 0 0 1px rgba(225,6,0,0.22)",
                        }}
                      >
                        <X size={16} strokeWidth={2.6} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        title="Delete"
                        aria-label={`Delete overtime entry of ${fmtDate(r.workDate)}`}
                        disabled={busy}
                        onClick={() => {
                          if (!confirm("Delete this overtime entry?")) return;
                          act(r.id, deleteOvertime, "Overtime deleted.");
                        }}
                        className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-[color:var(--color-altus-red)] disabled:opacity-50"
                        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
