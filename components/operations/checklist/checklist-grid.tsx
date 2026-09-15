"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  CHECK_STATUSES,
  checklistProgress,
  STATUS_TONE,
  type CheckStatus,
  type ChecklistItemRow,
  type ChecklistPersonRow,
  type ChecklistRunRow,
} from "@/lib/operations/checklist";
import {
  PHASE_LABELS,
  PHASE_ORDER,
  compareRows,
  formatDMY,
  formatOffset,
  isSunday,
  parseOffset,
  phaseFor,
  targetDate,
  variance,
  type ChecklistPhase,
} from "@/lib/operations/checklist-dates";
import {
  createChecklistItem,
  removeChecklistItem,
  setChecklistCheck,
  updateChecklistItem,
  updateChecklistRun,
} from "@/app/(app)/operations/checklist/actions";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** Today, as a calendar date, for the running-lateness figure. */
function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** DD/MM/YYYY HH:MM in IST — the Actual Date column. */
function formatActual(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** The calendar date a tick was made, for variance. */
function actualYmd(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export interface ChecklistGridProps {
  run: ChecklistRunRow;
  items: ChecklistItemRow[];
  people: ChecklistPersonRow[];
  canEdit: boolean;
}

/**
 * THE EVENT CHECKLIST GRID.
 *
 * Rows group under Before / During / After by the SIGN of their offset, and
 * every date in the table derives from one number — the run's event date —
 * so moving the event moves the whole plan in one write.
 *
 * ── WHY EDITS SAVE PER CELL ──────────────────────────────────────────────
 * There is no Save button. A checklist is filled in over days by several
 * people, and a form that has to be submitted as a whole either loses one
 * person's work to another's refresh or quietly overwrites it. Each cell
 * commits on blur, shows its own state, and a failure reverts that cell alone.
 */
export function ChecklistGrid({ run, items, people, canEdit }: ChecklistGridProps) {
  const router = useRouter();
  const today = todayYmd();

  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<ChecklistPhase>>(new Set());

  /* Collapse state is a convenience, not data — a private window throws on
     localStorage access, so every touch is guarded and the page renders the
     same either way.

     THIS ONE HAS TO BE AN EFFECT. localStorage does not exist during the server
     render, so reading it in a lazy initialiser would have the server render
     every group open and the client render some collapsed — a hydration
     mismatch. Reading after mount is the hydration-safe order, and the one
     extra render it costs is a group closing, which is invisible. */
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`ops-checklist-collapsed:${run.id}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above: a lazy initialiser would desync hydration.
      if (raw) setCollapsed(new Set(JSON.parse(raw) as ChecklistPhase[]));
    } catch {
      /* no stored preference — open everything */
    }
  }, [run.id]);

  const togglePhase = (p: ChecklistPhase) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      try {
        window.localStorage.setItem(
          `ops-checklist-collapsed:${run.id}`,
          JSON.stringify([...next]),
        );
      } catch {
        /* not storable here — the session still works, it just won't persist */
      }
      return next;
    });
  };

  async function run_<T>(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not save.");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  /* ── Grouping ───────────────────────────────────────────────────────────── */
  const grouped = React.useMemo(() => {
    const by = new Map<ChecklistPhase, ChecklistItemRow[]>();
    for (const p of PHASE_ORDER) by.set(p, []);
    for (const it of items) {
      // A non-event run has no phases — every row lands in one list.
      const phase = run.isEvent ? phaseFor(it.offsetDays) : "undated";
      by.get(phase)!.push(it);
    }
    for (const list of by.values()) list.sort(compareRows);
    return by;
  }, [items, run.isEvent]);

  const overall = checklistProgress(items.map((i) => i.status));

  /** Which groups get a header. Undated only appears when it has rows. */
  const phases: ChecklistPhase[] = run.isEvent
    ? PHASE_ORDER.filter((p) => p !== "undated" || (grouped.get(p)?.length ?? 0) > 0)
    : ["undated"];

  return (
    <div className="flex flex-col gap-4">
      {/* ── The event moved banner ─────────────────────────────────────────── */}
      {run.calendarDate && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[13px]"
          style={{ borderColor: "#FCD34D", background: "#FFFBEB", color: "#92400E" }}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>
            This event moved to <b>{formatDMY(run.calendarDate)}</b> in Monthly Events Master.
            The checklist is still planned around {formatDMY(run.eventDate)}.
          </span>
          {canEdit && (
            <button
              type="button"
              className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: ACCENT_DEEP }}
              disabled={busy !== null}
              onClick={() =>
                run_("recalc", () =>
                  updateChecklistRun({ id: run.id, eventDate: run.calendarDate }),
                )
              }
            >
              Recalculate every date
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border px-4 py-3 text-[13px]"
          style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: "#991B1B" }}
        >
          {error}
        </div>
      )}

      {/* ── Summary strip ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-slate-600">
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: ACCENT_DEEP }} />
          {run.isEvent ? (
            <>
              <b className="text-slate-900">{run.eventTitle ?? run.title}</b>
              <span className="tabular-nums">{formatDMY(run.eventDate)}</span>
            </>
          ) : (
            <b className="text-slate-900">Standing checklist</b>
          )}
        </span>
        <span>
          <b className="text-slate-900 tabular-nums">
            {overall.done}/{overall.total}
          </b>{" "}
          done · {overall.pct}%
          {overall.notApplicable > 0 && (
            <span className="text-slate-400"> · {overall.notApplicable} N/A</span>
          )}
        </span>
      </div>

      {/* ── The grid ───────────────────────────────────────────────────────── */}
      <div className="table-scroll overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="w-12 px-3 py-2.5">S.No</th>
              <th className="w-40 px-3 py-2.5">Doer</th>
              <th className="px-3 py-2.5">Activity</th>
              <th className="w-20 px-3 py-2.5">{run.isEvent ? "Offset" : ""}</th>
              <th className="w-28 px-3 py-2.5">Target</th>
              <th className="w-40 px-3 py-2.5">Backup</th>
              <th className="w-16 px-3 py-2.5 text-center">Done</th>
              <th className="w-36 px-3 py-2.5">Actual</th>
              <th className="w-20 px-3 py-2.5 text-right">Var</th>
              {canEdit && <th className="w-10 px-2 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {phases.map((phase) => {
              const rows = grouped.get(phase) ?? [];
              const isShut = collapsed.has(phase);
              const prog = checklistProgress(rows.map((r) => r.status));
              const colSpan = canEdit ? 10 : 9;

              return (
                <React.Fragment key={phase}>
                  <tr>
                    <td colSpan={colSpan} className="p-0">
                      <button
                        type="button"
                        onClick={() => togglePhase(phase)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider"
                        style={{ background: "#FEF2F2", color: ACCENT_DEEP }}
                      >
                        {isShut ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {run.isEvent ? PHASE_LABELS[phase] : "All tasks"}
                        <span className="font-normal normal-case tracking-normal opacity-70">
                          · {rows.length} {rows.length === 1 ? "task" : "tasks"}
                          {rows.length > 0 && ` · ${prog.done} done`}
                        </span>
                      </button>
                    </td>
                  </tr>

                  {!isShut &&
                    rows.map((item, i) => (
                      <GridRow
                        key={item.id}
                        item={item}
                        index={i + 1}
                        run={run}
                        people={people}
                        canEdit={canEdit}
                        today={today}
                        busy={busy}
                        onRun={run_}
                      />
                    ))}

                  {!isShut && rows.length === 0 && (
                    <tr>
                      <td colSpan={colSpan} className="px-3 py-3 text-slate-400">
                        Nothing here yet.
                      </td>
                    </tr>
                  )}

                  {!isShut && canEdit && (
                    <QuickAddRow
                      runId={run.id}
                      phase={phase}
                      isEvent={run.isEvent}
                      colSpan={colSpan}
                      busy={busy}
                      onRun={run_}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

function GridRow({
  item,
  index,
  run,
  people,
  canEdit,
  today,
  busy,
  onRun,
}: {
  item: ChecklistItemRow;
  index: number;
  run: ChecklistRunRow;
  people: ChecklistPersonRow[];
  canEdit: boolean;
  today: string;
  busy: string | null;
  onRun: (k: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const target = run.isEvent
    ? targetDate(run.eventDate, item.offsetDays)
    : item.targetDate;

  const actual = actualYmd(item.doneAt);
  const v = variance(target, actual, today);
  const running = v !== null && !actual;
  const sunday = isSunday(target);

  const tone = STATUS_TONE[item.status];
  const isDone = item.status === "Done";
  const isNa = item.status === "Not Applicable";

  const rowBusy = busy === `row:${item.id}`;

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
      <td className="px-3 py-2 tabular-nums text-slate-400">{index}</td>

      <td className="px-3 py-2">
        <PersonCell
          value={item.doerId}
          people={people}
          disabled={!canEdit || busy !== null}
          onChange={(v2) =>
            onRun(`row:${item.id}`, () => updateChecklistItem({ id: item.id, doerId: v2 }))
          }
        />
      </td>

      <td className="px-3 py-2">
        <TextCell
          value={item.title}
          disabled={!canEdit || busy !== null}
          onCommit={(v2) =>
            onRun(`row:${item.id}`, () => updateChecklistItem({ id: item.id, title: v2 }))
          }
        />
        {item.jdEntryId && (
          <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            from JD
          </span>
        )}
      </td>

      <td className="px-3 py-2">
        {run.isEvent ? (
          <OffsetCell
            value={item.offsetDays}
            disabled={!canEdit || busy !== null}
            onCommit={(v2) =>
              onRun(`row:${item.id}`, () =>
                updateChecklistItem({ id: item.id, offsetDays: v2 }),
              )
            }
          />
        ) : null}
      </td>

      <td className="px-3 py-2 tabular-nums">
        <span className={target ? "text-slate-700" : "text-slate-300"}>
          {formatDMY(target)}
        </span>
        {sunday && (
          <span
            className="ml-1 rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
            style={{ background: "#FEF3C7", color: "#92400E" }}
            title="Falls on a Sunday"
          >
            Sun
          </span>
        )}
      </td>

      <td className="px-3 py-2">
        <PersonCell
          value={item.backupId}
          people={people}
          muted
          disabled={!canEdit || busy !== null}
          onChange={(v2) =>
            onRun(`row:${item.id}`, () => updateChecklistItem({ id: item.id, backupId: v2 }))
          }
        />
      </td>

      <td className="px-3 py-2 text-center">
        <StatusCell
          status={item.status}
          disabled={busy !== null}
          onSet={(s) =>
            onRun(`row:${item.id}`, () =>
              setChecklistCheck({ runId: run.id, itemId: item.id, status: s }),
            )
          }
        />
      </td>

      <td className="px-3 py-2 tabular-nums text-slate-600">
        {rowBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : (
          formatActual(item.doneAt)
        )}
      </td>

      <td className="px-3 py-2 text-right">
        {isNa || v === null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <span
            className="inline-block rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
            style={
              v > 0
                ? { background: "rgba(185,28,28,0.10)", color: "#b91c1c" }
                : v < 0
                  ? { background: "rgba(22,128,61,0.10)", color: "#15803d" }
                  : { background: "rgba(100,116,139,0.10)", color: "#64748b" }
            }
            title={running ? "Still open — running late" : "Against the target date"}
          >
            {v > 0 ? `+${v}` : v} d{running ? "…" : ""}
          </span>
        )}
      </td>

      {canEdit && (
        <td className="px-2 py-2">
          <button
            type="button"
            aria-label="Remove row"
            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
            disabled={busy !== null}
            onClick={() => {
              if (item.status !== "Pending" && !window.confirm("This row has been ticked. Remove it?")) {
                return;
              }
              void onRun(`row:${item.id}`, () => removeChecklistItem({ id: item.id }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

/* ── Cells ────────────────────────────────────────────────────────────────── */

function TextCell({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  /* The committed value is the source of truth; `draft` is what is being typed.
     Re-syncing during render (rather than in an effect) is React's documented
     way to reset derived state when the input changes — an effect would render
     the stale value once before correcting it. */
  const [draft, setDraft] = React.useState(value);
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  if (disabled) return <span className="text-slate-700">{value}</span>;

  return (
    <textarea
      rows={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t && t !== value) onCommit(t);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        // Enter commits; Shift+Enter is a newline. Escape abandons the edit,
        // which is the only way back out of a half-typed cell.
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-slate-800 outline-none hover:border-slate-200 focus:border-slate-300 focus:bg-white"
    />
  );
}

function OffsetCell({
  value,
  disabled,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (v: number | null) => void;
}) {
  const asText = value === null ? "" : String(value);
  const [draft, setDraft] = React.useState(asText);
  const [seen, setSeen] = React.useState(asText);
  if (seen !== asText) {
    setSeen(asText);
    setDraft(asText);
  }

  if (disabled) {
    return <span className="tabular-nums text-slate-600">{formatOffset(value)}</span>;
  }

  return (
    <input
      value={draft}
      inputMode="numeric"
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = draft.trim() === "" ? null : parseOffset(draft);
        // parseOffset returns null for junk AND for blank. Only commit when the
        // value actually changed, so a typo reverts instead of silently
        // clearing a real offset.
        if (draft.trim() !== "" && parsed === null) {
          setDraft(value === null ? "" : String(value));
          return;
        }
        if (parsed !== value) onCommit(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value === null ? "" : String(value));
          e.currentTarget.blur();
        }
      }}
      className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[13px] tabular-nums text-slate-800 outline-none hover:border-slate-200 focus:border-slate-300 focus:bg-white"
    />
  );
}

function PersonCell({
  value,
  people,
  muted,
  disabled,
  onChange,
}: {
  value: string | null;
  people: ChecklistPersonRow[];
  muted?: boolean;
  disabled: boolean;
  onChange: (v: string | null) => void;
}) {
  const name = people.find((p) => p.id === value)?.name ?? null;

  if (disabled) {
    return (
      <span className={muted ? "text-slate-400" : "text-slate-700"}>{name ?? "—"}</span>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] outline-none hover:border-slate-200 focus:border-slate-300 focus:bg-white ${
        muted ? "text-slate-500" : "text-slate-800"
      }`}
    >
      <option value="">—</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The Done checkbox, with the other two states behind it.
 *
 * One click covers the common case (Pending ⇄ Done). "Need Help" and "Not
 * Applicable" live in the small menu, because dropping them entirely would
 * leave only two honest options for work that never needed doing — tick Done
 * and inflate the rate, or leave it Pending and look negligent.
 */
function StatusCell({
  status,
  disabled,
  onSet,
}: {
  status: CheckStatus;
  disabled: boolean;
  onSet: (s: CheckStatus) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const tone = STATUS_TONE[status];
  const isDone = status === "Done";
  const isPlain = status === "Done" || status === "Pending";

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={`Mark done — currently ${status}`}
        disabled={disabled}
        onClick={() => onSet(isDone ? "Pending" : "Done")}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="grid h-[18px] w-[18px] place-items-center rounded border-[1.5px] transition-colors"
        style={{
          borderColor: isDone ? "#15803d" : isPlain ? "#CBD5E1" : tone.fg,
          background: isDone ? "#15803d" : isPlain ? "transparent" : tone.bg,
          color: isDone ? "#fff" : tone.fg,
        }}
      >
        {isDone && <span className="text-[11px] leading-none">✓</span>}
        {!isPlain && <span className="text-[10px] font-bold leading-none">!</span>}
      </button>

      <button
        type="button"
        aria-label="More completion states"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="rounded px-0.5 text-slate-300 hover:text-slate-600"
      >
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {CHECK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSet(s);
                }}
                className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-slate-50 ${
                  s === status ? "font-semibold" : ""
                }`}
                style={{ color: STATUS_TONE[s].fg }}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The always-present blank row at the foot of a group.
 *
 * It carries the group's sign already, so typing an activity under "Before
 * Event" produces a negative offset without anybody choosing one. Adding ten
 * tasks should never need the mouse.
 */
function QuickAddRow({
  runId,
  phase,
  isEvent,
  colSpan,
  busy,
  onRun,
}: {
  runId: string;
  phase: ChecklistPhase;
  isEvent: boolean;
  colSpan: number;
  busy: string | null;
  onRun: (k: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");

  const defaultOffset =
    !isEvent || phase === "undated" ? null : phase === "before" ? -1 : phase === "during" ? 0 : 1;

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    void onRun(`add:${phase}`, () =>
      createChecklistItem({ runId, title: t, offsetDays: defaultOffset }),
    );
  };

  return (
    <tr className="border-b border-slate-100 bg-slate-50/40">
      <td className="px-3 py-1.5 text-slate-300">
        <Plus className="h-3.5 w-3.5" />
      </td>
      <td colSpan={colSpan - 2} className="px-3 py-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Add a task to ${isEvent ? PHASE_LABELS[phase] : "the checklist"} — press Enter`}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-slate-700 outline-none placeholder:text-slate-400 hover:border-slate-200 focus:border-slate-300 focus:bg-white"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        {busy === `add:${phase}` ? (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim() || busy !== null}
            className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            Add
          </button>
        )}
      </td>
    </tr>
  );
}
