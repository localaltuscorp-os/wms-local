"use client";

import * as React from "react";
import { Check, Loader2, Lock, Minus, SlashIcon, X } from "lucide-react";
import { DCC_STATUSES, type DccStatus } from "@/lib/dcc/util";
import { setDccEntry } from "@/app/(app)/dcc/actions";

/**
 * THE DAILY BOARD (DCC-SPEC §6) — the screen most people open once a day.
 *
 * One row per compliance due today, a four-way status control, an optional note
 * and number. Saving is per row and immediate: a "Save all" button at the bottom
 * of a twenty-row list is a button people forget, and a forgotten save here
 * looks exactly like a missed compliance in tomorrow's report.
 *
 * ── WHY THE ROW OWNS ITS OWN PENDING STATE ─────────────────────────────────
 * Each row saves independently, so one slow write must not grey out the other
 * nineteen. The optimistic value is held per row and rolled back on failure,
 * with the server's reason shown on that row rather than in a page-level banner
 * that does not say which row it is about.
 */

export interface BoardRow {
  itemId: string;
  title: string;
  section: string | null;
  code: string | null;
  targetNumber: string | null;
  unit: string | null;
  /** Where this compliance came from — shown so the delete rule is legible. */
  masterDesignation: string | null;
  status: DccStatus | null;
  note: string | null;
  value: string | null;
}

const STATUS_STYLE: Record<DccStatus, { bg: string; fg: string; Icon: typeof Check }> = {
  Done: { bg: "#D9EAD3", fg: "#1E4620", Icon: Check },
  "Not done": { bg: "#F7DCDC", fg: "#B3261E", Icon: X },
  NA: { bg: "#E8EAED", fg: "#5F6368", Icon: SlashIcon },
  Pending: { bg: "#FFF2CC", fg: "#7F6000", Icon: Minus },
};

export function DccBoard({
  rows,
  date,
  editable,
  lockedReason,
}: {
  rows: BoardRow[];
  date: string;
  editable: boolean;
  lockedReason?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p className="text-[14px] font-semibold text-ink">Nothing is due today.</p>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          Compliances appear here on the days their frequency says they are due.
        </p>
      </div>
    );
  }

  // Grouped by section so a long list reads as areas of work rather than one
  // undifferentiated column. Sections keep the order the query returned them in.
  const groups: { section: string; rows: BoardRow[] }[] = [];
  for (const r of rows) {
    const name = r.section?.trim() || "Other";
    const last = groups[groups.length - 1];
    if (last && last.section === name) last.rows.push(r);
    else groups.push({ section: name, rows: [r] });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.section} className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {g.section}
          </h2>
          <ul>
            {g.rows.map((r) => (
              <BoardRowView
                key={r.itemId}
                row={r}
                date={date}
                editable={editable}
                lockedReason={lockedReason}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BoardRowView({
  row,
  date,
  editable,
  lockedReason,
}: {
  row: BoardRow;
  date: string;
  editable: boolean;
  lockedReason?: string;
}) {
  const [status, setStatus] = React.useState<DccStatus | null>(row.status);
  const [note, setNote] = React.useState(row.note ?? "");
  const [value, setValue] = React.useState(row.value ?? "");
  const [busy, startSaving] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  /* The last value the SERVER accepted. A failed save rolls back to this rather
     than to the prop, which would be stale after an earlier successful save. */
  const committed = React.useRef<DccStatus | null>(row.status);

  function save(next: {
    status?: DccStatus | null;
    note?: string;
    value?: string;
  }) {
    const prev = committed.current;
    const s = next.status !== undefined ? next.status : status;
    if (next.status !== undefined) setStatus(next.status);
    setError(null);

    startSaving(async () => {
      const raw = next.value !== undefined ? next.value : value;
      const parsedValue = raw.trim() === "" ? null : Number(raw);
      const res = await setDccEntry({
        itemId: row.itemId,
        date,
        status: s,
        note: (next.note !== undefined ? next.note : note).trim() || null,
        value: parsedValue !== null && Number.isFinite(parsedValue) ? parsedValue : null,
      });
      if (res.ok) {
        committed.current = s;
      } else {
        setStatus(prev);
        setError(res.error);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-ink-strong">
          {row.code && <span className="mr-2 font-mono text-[11.5px] text-slate-400">{row.code}</span>}
          {row.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-subtle">
          {row.targetNumber && (
            <span className="tabular-nums">
              Target {row.targetNumber}
              {row.unit ? ` ${row.unit}` : ""}
            </span>
          )}
          {row.masterDesignation && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500">
              From the {row.masterDesignation} master
            </span>
          )}
          {error && (
            <span role="alert" className="font-semibold text-red-600">
              {error}
            </span>
          )}
        </p>
      </div>

      {row.targetNumber && (
        <input
          type="number"
          aria-label={`${row.title} — number`}
          disabled={!editable || busy}
          value={value}
          placeholder="—"
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => editable && save({ value: e.target.value })}
          className="h-8 w-20 rounded-md border border-slate-300 px-2 text-right text-[13px] tabular-nums disabled:bg-slate-50"
        />
      )}

      <input
        type="text"
        aria-label={`${row.title} — note`}
        disabled={!editable || busy}
        value={note}
        placeholder="Note"
        onChange={(e) => setNote(e.target.value)}
        onBlur={(e) => editable && save({ note: e.target.value })}
        className="h-8 w-40 rounded-md border border-slate-300 px-2 text-[13px] disabled:bg-slate-50 max-md:w-full"
      />

      <div
        role="group"
        aria-label={`${row.title} — status`}
        className="flex shrink-0 items-center gap-1"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />}
        {!editable && (
          <span title={lockedReason} className="mr-1 text-slate-400">
            <Lock className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        {DCC_STATUSES.map((s) => {
          const on = status === s;
          const st = STATUS_STYLE[s];
          return (
            <button
              key={s}
              type="button"
              disabled={!editable || busy}
              aria-pressed={on}
              onClick={() => save({ status: on ? null : s })}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                on ? "" : "text-slate-500 hover:bg-slate-100"
              }`}
              style={on ? { background: st.bg, color: st.fg } : undefined}
            >
              <st.Icon className="h-3.5 w-3.5" aria-hidden />
              {s}
            </button>
          );
        })}
      </div>
    </li>
  );
}
