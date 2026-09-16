"use client";

import * as React from "react";
import { Check, Loader2, Lock } from "lucide-react";
import {
  SP1_CALC_ROWS,
  SP1_DISPOSITIONS,
  SP1_LABEL,
  SP1_TONE,
  SP1_TONE_STYLE,
  formatCalc,
  metricsOf,
  type Sp1Counts,
  type Sp1Disposition,
} from "@/lib/dcc/sp1";
import { saveCallLog } from "@/app/(app)/dcc/call-log/actions";

/**
 * ENTERING A DAY'S CALL OUTCOMES (DCC-SPEC §7).
 *
 * The fifteen rows in the sheet's order and colour, one number each, with the
 * calculated block updating as you type — so the person sees their own day
 * resolve instead of typing into a void and waiting for tomorrow's report.
 *
 * ── WHY THE TOTALS ARE DERIVED, NOT STATE ──────────────────────────────────
 * Every figure under the fifteen is a pure function of the fifteen. Keeping
 * them in state and correcting them in an effect is how the two drift apart;
 * `metricsOf(counts)` on each render cannot.
 *
 * ── WHY THE INPUTS HOLD STRINGS ────────────────────────────────────────────
 * A number input bound to a number cannot hold "" while you clear it, so the
 * field fights the cursor: delete the 3 and a 0 appears under it. The draft is
 * text, and `numeric()` is the one place it becomes a number.
 */

export interface CallLogFormProps {
  employeeId: string;
  date: string;
  initial: Sp1Counts;
  /** False when the day has closed (11:59 pm IST) for this viewer. */
  editable: boolean;
  /** Why it is locked, shown in place of the Save button. */
  lockedReason?: string;
  /** Whose day this is, when it is not your own. */
  personName?: string;
}

type Draft = Record<Sp1Disposition, string>;

const toDraft = (c: Sp1Counts): Draft => {
  const d = {} as Draft;
  for (const k of SP1_DISPOSITIONS) d[k] = c[k] === 0 ? "" : String(c[k]);
  return d;
};

/** "" and any non-number read as 0 — a blank cell means none landed here. */
const numeric = (s: string): number => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function CallLogForm({
  employeeId,
  date,
  initial,
  editable,
  lockedReason,
  personName,
}: CallLogFormProps) {
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(initial));
  const [saving, startSaving] = React.useTransition();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* The saved baseline, so "Save" goes quiet once the form matches the database.
     STATE, not a ref: `dirty` is read during render, and a ref read at render
     time is exactly the value React does not promise to have re-rendered for. */
  const [baseline, setBaseline] = React.useState(() => JSON.stringify(toDraft(initial)));
  const dirty = JSON.stringify(draft) !== baseline;

  const counts = React.useMemo(() => {
    const c = {} as Sp1Counts;
    for (const k of SP1_DISPOSITIONS) c[k] = numeric(draft[k]);
    return c;
  }, [draft]);
  const metrics = metricsOf(counts);

  function submit() {
    setError(null);
    startSaving(async () => {
      const res = await saveCallLog({ employeeId, date, counts });
      if (res.ok) {
        setBaseline(JSON.stringify(draft));
        setSaved(true);
        // The tick is a confirmation, not a state — it should fade rather than
        // sit there implying the form is still "saved" after the next edit.
        window.setTimeout(() => setSaved(false), 2200);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="mr-auto">
          <h2 className="text-[15px] font-bold text-ink-strong">
            {personName ? `${personName}'s calls` : "Your calls"}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {editable
              ? "Blank means none. Totals update as you type."
              : (lockedReason ?? "This day is closed.")}
          </p>
        </div>

        {editable ? (
          <button
            type="button"
            onClick={submit}
            disabled={saving || !dirty}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : saved ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : null}
            {saving ? "Saving…" : saved ? "Saved" : dirty ? "Save day" : "Saved"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-[12.5px] font-semibold text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Locked
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="border-b border-slate-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {/* Two columns on a wide screen, one on a phone — fifteen rows plus eight
          calculated ones is a long scroll otherwise. */}
      <div className="grid grid-cols-2 gap-x-6 p-4 max-md:grid-cols-1">
        <ul className="contents">
          {SP1_DISPOSITIONS.map((d, i) => {
            const tone = SP1_TONE_STYLE[SP1_TONE[d]];
            return (
              <li key={d} className="flex items-center gap-2 py-0.5">
                <label
                  htmlFor={`sp1-${d}`}
                  className="flex min-w-0 flex-1 items-center rounded-md px-2.5 py-1.5 text-[13px] font-semibold"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  <span className="mr-2 inline-block w-4 shrink-0 text-right opacity-60 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="truncate">{SP1_LABEL[d]}</span>
                </label>
                <input
                  id={`sp1-${d}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  disabled={!editable}
                  value={draft[d]}
                  placeholder="0"
                  onChange={(e) => setDraft((p) => ({ ...p, [d]: e.target.value }))}
                  className="h-8 w-20 shrink-0 rounded-md border border-slate-300 px-2 text-right text-[13px] tabular-nums disabled:bg-slate-50 disabled:text-slate-400"
                />
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="grid grid-cols-4 gap-px border-t border-slate-200 bg-slate-200 max-lg:grid-cols-2">
        {SP1_CALC_ROWS.map((row) => (
          <div key={row.key} className="bg-white px-3 py-2.5">
            <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              {row.label}
            </dt>
            <dd className="text-[17px] font-black tabular-nums text-ink-strong">
              {formatCalc(row, metrics)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
