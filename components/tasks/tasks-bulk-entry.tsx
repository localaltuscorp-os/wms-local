"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  X,
  Check,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { bulkCreateTasks } from "@/app/(app)/tasks/actions";
import { TasksBulkGrid, type Person, type TaskGridRow } from "./tasks-bulk-grid";
import { TaskImport } from "./task-import";
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import { fireToast } from "@/lib/toast";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/** Lowercase-alphanumeric normalize — for duplicate keys. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Dup = "file" | null;

interface Row {
  key: number;
  title: string;
  subject: string | null;
  description: string | null;
  priority: TaskPriority;
  dueDate: string;
  doers: Person[];
  initiator: Person | null;
  errors: string[];
  dup: Dup;
  include: boolean;
}

/** Recompute per-row validation + in-batch duplicate flags for the whole set.
 *  A duplicate = same Client + Subject + first Doer repeated earlier in the batch. */
function evaluate(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const errors: string[] = [];
    if (!r.title.trim()) errors.push("Client name is required");
    if (r.doers.length === 0) errors.push("Pick at least one Doer");
    if (!r.initiator) errors.push("Initiator is required");
    if (!r.dueDate) errors.push("Due date is required");

    const doerKey = r.doers[0]?.id ?? "";
    const key = norm(`${r.title}|${r.subject ?? ""}|${doerKey}`);
    let dup: Dup = null;
    if (r.title.trim()) {
      if (seen.has(key)) dup = "file";
      seen.add(key);
    }
    return { ...r, errors, dup, include: errors.length === 0 && dup === null };
  });
}

export function TasksBulkEntry({
  roster,
  clients,
  subjects,
  me,
  onSuccess,
}: {
  roster: Person[];
  clients: string[];
  subjects: string[];
  me: Person | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = rows ? rows.length - validCount : 0;
  const dupCount = rows?.filter((r) => r.dup !== null).length ?? 0;
  const selectedCount = rows?.filter((r) => r.include && r.errors.length === 0).length ?? 0;

  /** Grid "Proceed" → build preview rows and run the dup/anomaly evaluation. */
  function onGridProceed(gridRows: TaskGridRow[]) {
    if (gridRows.length === 0) {
      setError("Fill at least one task — a Client Name and a Doer are required.");
      return;
    }
    setError(null);
    const asRows: Row[] = gridRows.map((g, i) => ({
      key: i + 1,
      title: g.title,
      subject: g.subject,
      description: g.description,
      priority: g.priority,
      dueDate: g.dueDate,
      doers: g.doers,
      initiator: g.initiator,
      errors: [],
      dup: null,
      include: true,
    }));
    setRows(evaluate(asRows));
  }

  function toggleRow(key: number) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.key === key && r.errors.length === 0 ? { ...r, include: !r.include } : r)) : prev,
    );
  }
  function editTitle(key: number, title: string) {
    setRows((prev) => (prev ? evaluate(prev.map((r) => (r.key === key ? { ...r, title } : r))) : prev));
  }
  function dropRow(key: number) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.key !== key);
      return next.length ? evaluate(next) : null;
    });
  }

  function doImport() {
    if (!rows) return;
    const payload = rows
      .filter((r) => r.include && r.errors.length === 0 && r.initiator)
      .map((r) => ({
        title: r.title,
        subject: r.subject,
        description: r.description,
        priority: r.priority,
        dueAt: `${r.dueDate}T12:00:00.000Z`,
        doerIds: r.doers.map((d) => d.id),
        initiatorId: r.initiator!.id,
      }));
    if (payload.length === 0) {
      setError("Select at least one valid row to import.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await bulkCreateTasks({ rows: payload });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: `Created ${res.created} task${res.created === 1 ? "" : "s"}${
          res.failed.length ? ` · ${res.failed.length} row${res.failed.length === 1 ? "" : "s"} skipped` : ""
        }.`,
        type: "success",
      });
      router.refresh();
      onSuccess?.();
    });
  }

  /* ---------- Review step ---------- */
  if (rows) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}>
            <CheckCircle2 size={14} /> {validCount} valid
          </span>
          {dupCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }}>
              <Copy size={13} /> {dupCount} duplicate{dupCount === 1 ? "" : "s"}
            </span>
          )}
          {invalidCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red-deep)" }}>
              <AlertTriangle size={14} /> {invalidCount} need fixing
            </span>
          )}
          <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--color-ink-subtle)" }}>
            {selectedCount} selected to create
          </span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-hairline)" }}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr style={{ background: "var(--color-surface-soft)" }}>
                {["", "Client (editable)", "Subject", "Priority", "Due", "Doer(s)", "Initiator", "Status", ""].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--color-ink-subtle)", borderBottom: "1px solid var(--color-hairline)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bad = r.errors.length > 0;
                const isDup = r.dup !== null;
                return (
                  <tr key={r.key} style={{
                    borderBottom: "1px solid var(--color-hairline)",
                    background: bad
                      ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)"
                      : isDup
                        ? "color-mix(in srgb, #b45309 6%, transparent)"
                        : r.include ? "transparent" : "var(--color-surface-soft)",
                  }}>
                    <td className="px-2.5 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={r.include && !bad}
                        disabled={bad}
                        onChange={() => toggleRow(r.key)}
                        aria-label={`Include row ${r.key}`}
                        className="size-4 cursor-pointer accent-[var(--color-altus-red)] disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-2.5 py-2 align-top">
                      <input
                        value={r.title}
                        onChange={(e) => editTitle(r.key, e.target.value)}
                        aria-label={`Client name row ${r.key}`}
                        className={`w-[200px] max-w-full rounded-md border bg-white px-2 py-1 text-[13px] font-semibold text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                        style={{ borderColor: bad ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
                      />
                      {bad && (
                        <div className="mt-0.5 text-[11.5px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>
                          {r.errors.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2 align-top text-ink-soft">{r.subject ?? "—"}</td>
                    <td className="px-2.5 py-2 align-top text-ink-soft">{PRIORITY_LABELS[r.priority]}</td>
                    <td className="px-2.5 py-2 align-top tabular-nums text-ink-soft">{r.dueDate || "—"}</td>
                    <td className="px-2.5 py-2 align-top text-ink-soft">
                      {r.doers.length ? r.doers.map((d) => d.name.split(" ")[0]).join(", ") : <span style={{ color: "var(--color-altus-red)" }}>—</span>}
                    </td>
                    <td className="px-2.5 py-2 align-top text-ink-soft">{r.initiator ? r.initiator.name.split(" ")[0] : "—"}</td>
                    <td className="px-2.5 py-2 align-top">
                      {isDup ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }} title="Same Client + Subject + Doer repeated earlier in the batch">
                          <Copy size={11} /> Repeat
                        </span>
                      ) : bad ? (
                        <span className="text-[11.5px] font-bold" style={{ color: "var(--color-altus-red-deep)" }}>Fix</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--color-green-deep)" }}>
                          <Check size={12} /> OK
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 align-top">
                      <button type="button" onClick={() => dropRow(r.key)} aria-label={`Remove row ${r.key}`} title="Remove this row" className={`grid size-6 place-items-center rounded-md text-altus-red hover:bg-altus-red hover:text-white ${FOCUS_RING}`}>
                        <Trash2 size={12} strokeWidth={2.4} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {dupCount > 0 && (
          <p className="mt-2 text-[12px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
            Duplicates are unticked by default. Rename the Client to make them unique, tick to create anyway, or remove the row.
          </p>
        )}
        {(invalidCount > 0) && (
          <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
            Rows needing fixes are excluded — go back to add a missing Doer or Due date.
          </p>
        )}

        {error && (
          <p className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}>
            <AlertTriangle size={15} /> {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => { setRows(null); setError(null); }}
            disabled={pending}
            className={`inline-flex items-center gap-1.5 rounded-full border border-hairline-strong px-4 py-2 text-[13.5px] font-semibold text-ink-soft hover:text-ink-strong hover:bg-surface-soft disabled:opacity-60 ${FOCUS_RING}`}
          >
            <ArrowLeft size={15} /> Back to Grid
          </button>
          <button
            type="button"
            onClick={doImport}
            disabled={pending || selectedCount === 0}
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13.5px] font-bold text-white transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${FOCUS_RING}`}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
            {pending ? "Creating…" : `Create ${selectedCount || ""}`.trim()}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Entry step — grid (primary) + file import (secondary) ---------- */
  return (
    <div>
      <TasksBulkGrid roster={roster} clients={clients} subjects={subjects} me={me} onProceed={onGridProceed} />

      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}>
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
        <span className="h-px flex-1" style={{ background: "var(--color-hairline)" }} />
        or import from a file
        <span className="h-px flex-1" style={{ background: "var(--color-hairline)" }} />
      </div>

      <TaskImport embedded onSuccess={onSuccess} />
    </div>
  );
}
