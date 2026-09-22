"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarRange, Loader2, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { categoryColors, execCategory } from "@/lib/exec-calendar/taxonomy";
import { minToLabel, parseDay } from "@/lib/exec-calendar/grid";
import {
  deleteExecRoutine,
  listMyRoutines,
  type RoutineSummary,
} from "@/app/(app)/events/actions";

/**
 * "Delete a routine" (asked 2026-09-18 — there was no way to remove one).
 *
 * Each routine is a card: what it is, when it runs, and how many blocks it has
 * left on the calendar. Deleting asks ONE question, because it is the only one
 * that matters: what happens to the blocks it already stamped?
 *
 *   Stop it from today   removes today's and later blocks, keeps the past —
 *                        the weeks it did run are still what happened
 *   Delete everything    removes every block it ever stamped
 *
 * The count is shown on each button, so nobody discovers afterwards that
 * "delete" meant forty blocks.
 *
 * Picking one does NOT delete straight away (asked 2026-09-18): it opens a
 * confirmation screen that repeats exactly what will go, with Cancel and
 * Delete. The row's Delete button opens and closes the choice, which replaced
 * the old "Keep it" link.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(ymd: string): string {
  const d = parseDay(ymd);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length === 7) return "Every day";
  const sorted = [...days].sort();
  if (sorted.join() === "0,1,2,3,4") return "Weekdays";
  if (sorted.join() === "5,6") return "Weekends";
  return sorted.map((d) => WEEKDAYS[d]).join(", ");
}

export function ExecRoutineDeleteList({ today }: { today: string }) {
  const router = useRouter();
  const [routines, setRoutines] = React.useState<RoutineSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  /** The choice waiting on the confirmation screen, if any. */
  const [pending, setPending] = React.useState<{ routine: RoutineSummary; scope: "upcoming" | "all" } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await listMyRoutines(today);
    if (!res.ok) { setError(res.error); return; }
    setRoutines(res.routines);
  }, [today]);

  React.useEffect(() => { void load(); }, [load]);

  async function remove(r: RoutineSummary, scope: "upcoming" | "all") {
    setBusy(r.id);
    const res = await deleteExecRoutine(r.id, scope, today);
    setBusy(null);
    setPending(null);
    if (!res.ok) { setError(res.error); return; }
    fireToast({
      message: `Deleted "${r.title}" · ${res.removedBlocks} block${res.removedBlocks === 1 ? "" : "s"} removed`,
      type: "success",
    });
    setConfirming(null);
    await load();
    router.refresh();
  }

  if (error) {
    return (
      <p className="rounded-lg px-3 py-2 text-center text-[12px] font-semibold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
        {error}
      </p>
    );
  }

  if (routines === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-ink-muted">
        <Loader2 size={15} className="animate-spin" /> Loading your routines
      </div>
    );
  }

  if (routines.length === 0) {
    return (
      <div className="py-10 text-center">
        <CalendarRange size={26} className="mx-auto text-ink-subtle" />
        <p className="mt-2 text-[13px] font-semibold text-ink-strong">No routines yet</p>
        <p className="mt-1 text-[12px] text-ink-muted">Anything you stamp shows up here, ready to stop or remove.</p>
      </div>
    );
  }

  if (pending) {
    const { routine: r, scope } = pending;
    const past = r.blockCount - r.upcomingCount;
    const removes = scope === "upcoming" ? r.upcomingCount : r.blockCount;
    const deleting = busy === r.id;
    return (
      <div role="alertdialog" aria-labelledby="routine-confirm-title" aria-describedby="routine-confirm-body" className="py-4 text-center">
        <span
          className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}
        >
          <AlertTriangle size={20} strokeWidth={2.3} />
        </span>
        <h3 id="routine-confirm-title" className="mt-3 text-[15px] font-bold text-ink-strong">
          Delete routine &ldquo;{r.title}&rdquo;?
        </h3>
        <p id="routine-confirm-body" className="mx-auto mt-1.5 max-w-[42ch] text-[12.5px] leading-relaxed text-ink-muted">
          {scope === "upcoming"
            ? <>It stops from today: {removes} upcoming block{removes === 1 ? "" : "s"} will be removed and {past} past block{past === 1 ? "" : "s"} kept.</>
            : <>All {removes} block{removes === 1 ? "" : "s"} it put on the calendar will be removed.</>}{" "}
          This can&rsquo;t be undone.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            autoFocus
            disabled={deleting}
            onClick={() => setPending(null)}
            className="rounded-lg border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-strong transition hover:bg-surface-soft disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => remove(r, scope)}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition disabled:opacity-60"
            style={{ background: "var(--color-altus-red)" }}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? "Deleting…" : "Delete routine"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
      {routines.map((r) => {
        const col = categoryColors(r.categoryKey);
        const open = confirming === r.id;
        const past = r.blockCount - r.upcomingCount;
        return (
          <li
            key={r.id}
            className="rounded-xl border px-3 py-2.5 transition"
            // Longhand sides only: mixing the `borderColor` shorthand with `borderLeft`
            // made React warn on every open/close.
            style={{
              borderTopColor: open ? "var(--color-red-edge)" : "var(--color-hairline)",
              borderRightColor: open ? "var(--color-red-edge)" : "var(--color-hairline)",
              borderBottomColor: open ? "var(--color-red-edge)" : "var(--color-hairline)",
              borderLeft: `4px solid ${col.base}`,
            }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-[13.5px] font-bold text-ink-strong">{r.title}</span>
                  <span className="text-[11px] font-semibold" style={{ color: col.deep }}>
                    {execCategory(r.categoryKey).label}
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-ink-muted">
                  {daysLabel(r.daysOfWeek)} · {minToLabel(r.startMin)} – {minToLabel(r.endMin)}
                </div>
                <div className="text-[11.5px] text-ink-subtle">
                  {shortDate(r.fromDate)} → {shortDate(r.toDate)} · {r.blockCount} block
                  {r.blockCount === 1 ? "" : "s"} on the calendar
                </div>
              </div>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setConfirming(open ? null : r.id)}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[12px] font-bold transition hover:border-[var(--color-red-edge)] hover:text-[var(--color-red-deep)]"
                style={open ? { borderColor: "var(--color-red-edge)", color: "var(--color-red-deep)" } : { borderColor: "var(--color-hairline)", color: "var(--color-ink-muted)" }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>

            {open && (
              <div className="mt-2.5 border-t border-hairline pt-2.5">
                <p className="mb-2 text-[12px] font-semibold text-ink-strong">
                  What should happen to the blocks it already put on the calendar?
                </p>
                <div className="grid grid-cols-2 gap-1.5 max-sm:grid-cols-1">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => setPending({ routine: r, scope: "upcoming" })}
                    className="rounded-lg border-2 px-2.5 py-2 text-left transition disabled:opacity-50"
                    style={{ borderColor: "var(--color-altus-red)" }}
                  >
                    <span className="block text-[12.5px] font-bold" style={{ color: "var(--color-altus-red-deep)" }}>
                      Stop it from today
                    </span>
                    <span className="block text-[11px] text-ink-muted">
                      Removes {r.upcomingCount} upcoming · keeps {past} past
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => setPending({ routine: r, scope: "all" })}
                    className="rounded-lg border border-hairline px-2.5 py-2 text-left transition hover:border-hairline-strong disabled:opacity-50"
                  >
                    <span className="block text-[12.5px] font-bold text-ink-strong">Delete everything</span>
                    <span className="block text-[11px] text-ink-muted">Removes all {r.blockCount} blocks</span>
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
