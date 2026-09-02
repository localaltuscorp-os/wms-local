"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { Inbox, Loader2, Maximize2, Minimize2, X } from "lucide-react";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/db/enums";
import { formatDate } from "@/lib/format";
import { getPerformerDrilldown } from "@/app/(app)/dashboard/drilldown-actions";
import type { CompletedTaskRow, PerformerDrilldown } from "@/lib/queries/performer-drilldown";
import type { EisenhowerPriority } from "@/lib/types";

/**
 * Three-quarter-width slide-over listing ONE person's completed tasks.
 *
 * Rows are fetched on open (never with the dashboard) via `getPerformerDrilldown`,
 * which applies the same dashboard filters the leaderboard used — so the row
 * count here reconciles with the count on the card that opened it.
 *
 * The in-drawer filters (priority · client · due window) narrow CLIENT-SIDE over
 * that fetched set: it is one person's completions in a bounded window, so a
 * server round-trip per dropdown change would cost more than it saves and would
 * make the count flicker while typing.
 */

const PRIORITY_TONE: Record<EisenhowerPriority, string> = {
  imp_urgent: "bg-rose-100 text-rose-700 border-rose-200",
  not_imp_urgent: "bg-orange-100 text-orange-700 border-orange-200",
  imp_not_urgent: "bg-blue-100 text-blue-700 border-blue-200",
  not_imp_not_urgent: "bg-gray-100 text-gray-600 border-gray-200",
};

type DueFilter = "all" | "onTime" | "late";

export function PerformerTaskDrawer({
  open,
  employeeId,
  employeeName,
  onClose,
}: {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}) {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [full, setFull] = React.useState(false);
  const [priority, setPriority] = React.useState<EisenhowerPriority | "all">("all");
  const [client, setClient] = React.useState("all");
  const [due, setDue] = React.useState<DueFilter>("all");

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; data: PerformerDrilldown }
  >({ kind: "loading" });

  // Esc closes; the page behind must not scroll while the panel is up.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Reset per-open state so one person's filters never carry to the next.
  React.useEffect(() => {
    if (!open) return;
    setFull(false);
    setPriority("all");
    setClient("all");
    setDue("all");
  }, [open, employeeId]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    void getPerformerDrilldown(employeeId, search).then((res) => {
      if (cancelled) return;
      if ("error" in res) setState({ kind: "error", message: res.error });
      else setState({ kind: "ok", data: res });
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, search]);

  // Memoised: a bare conditional would hand back a fresh `[]` on every render,
  // which invalidates both memos below it and re-filters the whole list on
  // every keystroke elsewhere in the page.
  const all: CompletedTaskRow[] = React.useMemo(
    () => (state.kind === "ok" ? state.data.tasks : []),
    [state],
  );

  // Client list is derived from the RESULT, not a global roster: offering
  // clients this person never worked for would guarantee empty filters.
  const clients = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of all) if (t.client) set.add(t.client);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [all]);

  const rows = React.useMemo(
    () =>
      all.filter((t) => {
        if (priority !== "all" && t.priority !== priority) return false;
        if (client !== "all" && t.client !== client) return false;
        if (due === "onTime" && !(t.daysLate !== null && t.daysLate <= 0)) return false;
        if (due === "late" && !(t.daysLate !== null && t.daysLate > 0)) return false;
        return true;
      }),
    [all, priority, client, due],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Completed tasks for ${employeeName}`}
    >
      <button
        type="button"
        aria-label="Close task list"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30 backdrop-blur-sm"
      />

      <aside
        className={`wms-card relative flex h-full flex-col border-l bg-white shadow-2xl ${
          full ? "w-full" : "w-[75vw] max-w-6xl"
        }`}
        style={{ animation: "drawerIn 180ms ease-out" }}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-gray-900">
            Completed tasks — {employeeName}
          </h2>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold tabular-nums text-emerald-700">
            {rows.length}
            {rows.length !== all.length && ` of ${all.length}`}
          </span>
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            title={full ? "Exit full screen" : "Full screen"}
            aria-label={full ? "Exit full screen" : "Full screen"}
            aria-pressed={full}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            {full ? <Minimize2 size={14} strokeWidth={2.6} /> : <Maximize2 size={14} strokeWidth={2.6} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-5 py-2.5">
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={(v) => setPriority(v as EisenhowerPriority | "all")}
            options={[
              { value: "all", label: "All priorities" },
              ...TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
            ]}
          />
          <FilterSelect
            label="Client"
            value={client}
            onChange={setClient}
            options={[
              { value: "all", label: "All clients" },
              ...clients.map((c) => ({ value: c, label: c })),
            ]}
          />
          <FilterSelect
            label="Due"
            value={due}
            onChange={(v) => setDue(v as DueFilter)}
            options={[
              { value: "all", label: "Any due date" },
              { value: "onTime", label: "On or before due" },
              { value: "late", label: "After due date" },
            ]}
          />
        </div>

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {state.kind === "loading" && (
            <div className="flex h-full items-center justify-center gap-2 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[14px] font-semibold">Loading completed tasks…</span>
            </div>
          )}

          {state.kind === "error" && (
            <p className="flex h-full items-center justify-center px-6 text-center text-[14px] font-semibold text-gray-500">
              Couldn&apos;t load the list. {state.message}
            </p>
          )}

          {state.kind === "ok" && rows.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
              <Inbox size={26} strokeWidth={2} />
              <p className="text-[14px] font-semibold">
                {all.length === 0
                  ? "No completed tasks in this window."
                  : "No tasks match these filters."}
              </p>
            </div>
          )}

          {state.kind === "ok" && rows.length > 0 && (
            <table className="min-w-full">
              <thead>
                <tr>
                  {["Task", "Initiator", "Client", "Due", "Completed", "Priority"].map((h) => (
                    <th
                      key={h}
                      className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500"
                      style={{ boxShadow: "inset 0 -1px 0 rgb(229 231 235)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  // description -> subject -> title, same ladder as the
                  // punctuality list. Each rung is a real field, so a task with
                  // no body still labels itself with something actionable.
                  const taskLabel = t.description?.trim() || t.subject?.trim() || t.title;
                  // The hover carries what truncation ate plus the identifiers
                  // stripped from the label — nothing is lost, they just stop
                  // occupying the one line the eye scans.
                  const taskHover = [
                    taskLabel,
                    t.taskNo !== null ? `Task #${t.taskNo}` : null,
                    t.client ? `Client: ${t.client}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n");
                  return (
                  <tr key={t.id} className="h-11 border-b border-gray-100 transition-colors hover:bg-gray-50/80">
                    {/* `title` on the <td> as well as the link, so the hover
                        target is the whole cell rather than just the text run.
                        The label led with "#{taskNo} {t.title}" — and `title`
                        in this schema is the CLIENT NAME, which the Client
                        column two cells over already prints. So the row opened
                        with a number nobody quotes and then repeated the
                        client, saying nothing about the work itself. */}
                    <td className="max-w-[40ch] px-3 py-1.5" title={taskHover}>
                      <Link
                        href={`/tasks/${t.id}` as Route}
                        className="block truncate text-[13px] font-semibold text-gray-900 hover:underline"
                        title={taskHover}
                      >
                        {taskLabel}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[12.5px] text-gray-600">
                      {t.initiatorName ?? "—"}
                    </td>
                    <td className="max-w-[20ch] px-3 py-1.5">
                      <span className="block truncate text-[12.5px] text-gray-600" title={t.client ?? ""}>
                        {t.client ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="text-[12px] tabular-nums text-gray-600">
                        {t.dueAt ? formatDate(t.dueAt) : "—"}
                      </span>
                      {t.daysLate !== null && (
                        <span
                          className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ${
                            t.daysLate > 0
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {t.daysLate > 0 ? `+${t.daysLate}d` : "on time"}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[12px] tabular-nums text-gray-600">
                      {t.completedAt ? formatDate(t.completedAt) : "—"}
                      {t.turnaroundDays !== null && (
                        <span className="ml-1.5 text-[11px] text-gray-400">{t.turnaroundDays}d</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${PRIORITY_TONE[t.priority]}`}
                      >
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {state.kind === "ok" && state.data.truncated && (
            <p className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[12px] font-semibold text-gray-500">
              Showing the first {all.length.toLocaleString("en-IN")} completions — narrow the
              dashboard date range to see older work.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12.5px] font-semibold text-gray-800 outline-none focus:border-gray-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
