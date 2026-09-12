"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  FileText,
  Link2,
  Loader2,
  TriangleAlert,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { FUNCTION_LABELS, type BusinessFunction } from "@/lib/org/functions";
import { describeRecurrence, isDueOn } from "@/lib/jd/recurrence";
import { resolveAssignees, type ResolutionVia } from "@/lib/jd/ladder";
import type { JdEntryRow, JdPositionRow } from "@/lib/queries/job-description";
import { setJdEntryActive, updateJdEntry } from "@/app/(app)/operations/job-description/actions";
import { ModuleAssignBoxes } from "@/components/operations/job-description/module-assign-boxes";

const ACCENT = "#B91C1C";

export interface SeatHolder {
  positionId: string;
  employeeId: string;
  name: string;
}

/* ── Who actually does this ───────────────────────────────────────────────── */

export interface Doers {
  names: string[];
  via: ResolutionVia;
  /** The seat the work landed on when it escalated — null when it did not. */
  landedOn: JdPositionRow | null;
  /** Rank orders the climb passed through, for the audit line. */
  chain: number[];
}

/**
 * Run the REAL ladder, not a display approximation.
 *
 * This calls lib/jd/ladder.ts — the same function the push job uses — so what
 * the drawer shows and what the nightly push does cannot disagree. A screen
 * that computes its own answer is a screen that will eventually tell somebody
 * their task went to the wrong person.
 */
export function whoDoesIt(
  entry: JdEntryRow,
  positions: JdPositionRow[],
  holders: SeatHolder[],
): Doers {
  // An explicit assignment beats the seat, and the Bank stores those as names.
  if (entry.assignees.length > 0) {
    return { names: entry.assignees, via: "assigned", landedOn: null, chain: [] };
  }

  const seat = positions.find((p) => p.id === entry.positionId);
  if (!seat) return { names: [], via: "unassigned", landedOn: null, chain: [] };

  const res = resolveAssignees({
    position: {
      id: seat.id,
      functionKey: seat.functionKey,
      rankOrder: seat.rankOrder,
      title: seat.title,
    },
    positions: positions.map((p) => ({
      id: p.id,
      functionKey: p.functionKey,
      rankOrder: p.rankOrder,
      title: p.title,
    })),
    holders,
  });

  const nameOf = (id: string) => holders.find((h) => h.employeeId === id)?.name ?? id;
  return {
    names: res.employeeIds.map(nameOf),
    via: res.via,
    landedOn: res.escalatedToPositionId
      ? positions.find((p) => p.id === res.escalatedToPositionId) ?? null
      : null,
    chain: res.chain,
  };
}

/** The next few dates this job comes round, from the structured recurrence. */
function nextDueDates(entry: JdEntryRow, count = 4): string[] {
  const out: string[] = [];
  const start = new Date();
  for (let i = 0; i < 180 && out.length < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    try {
      if (isDueOn(entry.recurrence, ymd)) out.push(ymd);
    } catch {
      // A recurrence written by a future version must not blank the drawer.
      return out;
    }
  }
  return out;
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

const VIA_COPY: Record<ResolutionVia, { label: string; tone: string; bg: string }> = {
  delegation: { label: "Delegated", tone: "#6D28D9", bg: "#F5F3FF" },
  assigned: { label: "Assigned by name", tone: "#1D4ED8", bg: "#EFF6FF" },
  holder: { label: "Seat holder", tone: "#15803D", bg: "#F0FDF4" },
  escalated: { label: "Escalated — seat vacant", tone: "#B45309", bg: "#FFFBEB" },
  unassigned: { label: "Nobody — needs an owner", tone: "#B91C1C", bg: "#FEF2F2" },
};

/* ── The drawer ───────────────────────────────────────────────────────────── */

export function JdDetailDrawer({
  entry,
  positions,
  holders,
  people,
  onClose,
}: {
  entry: JdEntryRow;
  positions: JdPositionRow[];
  holders: SeatHolder[];
  people: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const doers = whoDoesIt(entry, positions, holders);
  const seat = positions.find((p) => p.id === entry.positionId) ?? null;
  const seatHolders = holders.filter((h) => h.positionId === entry.positionId);
  const due = nextDueDates(entry);
  const via = VIA_COPY[doers.via];

  // Escape closes. A panel that traps you is worse than no panel.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(patch: Record<string, unknown>, tag: string) {
    setError(null);
    setBusy(tag);
    try {
      const res = await updateJdEntry({ id: entry.id, ...patch });
      if (!res.ok) setError(res.error);
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30"
      />
      <aside className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-semibold text-slate-400">
              {entry.serialNo}
            </p>
            <h2 className="mt-0.5 text-[16px] font-bold leading-snug text-slate-900">
              {entry.task}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-6 py-5">
          {/* WHO — the question the whole module exists to answer, so it leads. */}
          <section
            className="rounded-xl border px-4 py-3"
            style={{ borderColor: `${via.tone}33`, background: via.bg }}
          >
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4" style={{ color: via.tone }} />
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: via.tone }}
              >
                {via.label}
              </span>
            </div>
            <p className="mt-1.5 text-[14px] font-semibold text-slate-900">
              {doers.names.length > 0 ? doers.names.join(", ") : "Unassigned queue"}
            </p>
            {doers.via === "escalated" && doers.landedOn && (
              <p className="mt-1 text-[12px] leading-relaxed text-slate-700">
                {seat?.title} is vacant, so this climbs to{" "}
                <b>{doers.landedOn.title}</b> — the nearest filled rank in the same
                function. It comes back down the day the seat is filled.
              </p>
            )}
            {doers.via === "unassigned" && (
              <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-red-800">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No filled rank above this seat in {FUNCTION_LABELS[entry.functionKey as BusinessFunction] ?? entry.functionKey}.
                This task cannot be pushed until somebody is placed or it is assigned by name.
              </p>
            )}
            {doers.via === "holder" && seatHolders.length > 1 && (
              <p className="mt-1 text-[12px] text-slate-600">
                Shared by everyone in the seat.
              </p>
            )}
          </section>

          <Row label="Position">
            <span className="font-semibold text-slate-900">{seat?.title ?? "—"}</span>
            {seat && (
              <span className="ml-2 text-slate-500">
                {seatHolders.length === 0
                  ? "· vacant"
                  : `· ${seatHolders.map((h) => h.name).join(", ")}`}
              </span>
            )}
          </Row>

          <Row label="Function">
            {FUNCTION_LABELS[entry.functionKey as BusinessFunction] ?? entry.functionKey}
          </Row>

          <Row label="Frequency">
            <span className="font-semibold text-slate-900">
              {describeRecurrence(entry.recurrence)}
            </span>
          </Row>

          {/* The next dates prove the structured recurrence is real and not a
              label — four of the ten frequencies cannot be read off a string. */}
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" /> Next due
            </p>
            {due.length === 0 ? (
              <p className="text-[13px] text-slate-400">
                Not on a computable schedule — the label describes it.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {due.map((d, i) => (
                  <li
                    key={d}
                    className={`rounded-lg px-2.5 py-1 text-[12px] tabular-nums ${
                      i === 0
                        ? "bg-slate-900 font-semibold text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {prettyDate(d)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Row label="Estimated time">
            <span className="tabular-nums">
              {entry.estimatedMinutes} min
              {entry.estimatedMinutes >= 60 && (
                <span className="text-slate-500">
                  {" "}
                  ({Math.floor(entry.estimatedMinutes / 60)}h {entry.estimatedMinutes % 60}m)
                </span>
              )}
            </span>
          </Row>

          {/* Editable in place. The drawer is where somebody actually looks at a
              JD, so it is where a wrong destination gets noticed. */}
          {/* ── WHERE IT GOES, AND WHO DOES IT THERE ─────────────────────────
              The same three boxes the form uses, stacked: this drawer is 560px
              wide, and three columns here would be three unusable columns.

              Each change saves on its own, as everything in this drawer does —
              there is no Save button, so a destination toggled off and left is
              still off when you close it. */}
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Add to
            </p>
            <ModuleAssignBoxes
              layout="stack"
              people={people}
              enabled={{ dcc: entry.pushDcc, wms: entry.pushWms, event: entry.pushEvent }}
              onToggleTarget={(t, on) =>
                save(
                  t === "dcc"
                    ? { pushDcc: on }
                    : t === "wms"
                      ? { pushWms: on }
                      : { pushEvent: on },
                  t,
                )
              }
              selected={entry.targetPeople}
              onChangeTarget={(t, ids) =>
                save({ targetPeople: { ...entry.targetPeople, [t]: ids } }, `people-${t}`)
              }
            />
            <p className="mt-2 text-[11px] text-slate-500">
              Leave a roster empty and the seat decides — which is what lets a vacancy
              escalate instead of stranding the work.
            </p>
          </section>

          {/* NOTES — in full, and nowhere else in full. The grid shows a single
              stripped line, because a cell that grows to fit a paragraph makes
              every other row unreadable; this is where the paragraph lives.
              Rendered as text rather than markup: the column is written by a
              plain textarea today, and printing it as HTML would execute
              whatever a future rich-text editor stored before it is sanitised. */}
          {entry.notesHtml?.trim() && (
            <section>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Notes
              </p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                {entry.notesHtml}
              </p>
            </section>
          )}

          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              SOP attachments
            </p>
            <div className="flex flex-col gap-1.5">
              <Attachment icon={<Video className="h-3.5 w-3.5" />} label="Video — how to do this" href={entry.videoUrl} />
              <Attachment icon={<FileText className="h-3.5 w-3.5" />} label="Guidelines — rules of execution" href={entry.guidelinesUrl} />
              <Attachment icon={<Link2 className="h-3.5 w-3.5" />} label="Templates — standard files" href={entry.templateUrl} />
            </div>
          </section>

          {error && <p className="text-[13px] text-red-700">{error}</p>}
        </div>

        <footer className="sticky bottom-0 mt-auto flex items-center gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            disabled={busy === "active"}
            onClick={async () => {
              setBusy("active");
              try {
                await setJdEntryActive({ id: entry.id, isActive: !entry.isActive });
                router.refresh();
              } finally {
                setBusy(null);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            {busy === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {entry.isActive ? "Retire this JD" : "Restore this JD"}
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            {entry.isActive ? "Active" : "Retired"}
          </span>
        </footer>
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 pb-3">
      <span className="w-32 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[13px] text-slate-700">{children}</span>
    </div>
  );
}

function Toggle({
  label,
  on,
  busy,
  onClick,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        on
          ? "border-transparent bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}

function Attachment({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string | null;
}) {
  if (!href) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-400">
        {icon}
        {label} — none attached
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-100"
    >
      {icon}
      {label}
      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-slate-400" />
    </a>
  );
}

/* ── By-position board ────────────────────────────────────────────────────── */

/**
 * The Bank, grouped by SEAT rather than listed flat.
 *
 * This is the view that makes the module's premise visible: a vacant seat still
 * carries its job descriptions, and each one shows where it climbs to. A flat
 * table can never show that, because the interesting fact is about a seat with
 * nobody in it — which has no row of its own in a list of tasks.
 */
export function PositionBoard({
  entries,
  positions,
  holders,
  onOpen,
}: {
  entries: JdEntryRow[];
  positions: JdPositionRow[];
  holders: SeatHolder[];
  onOpen: (entry: JdEntryRow) => void;
}) {
  const byFunction = React.useMemo(() => {
    const map = new Map<string, JdPositionRow[]>();
    for (const p of positions) {
      const list = map.get(p.functionKey) ?? [];
      list.push(p);
      map.set(p.functionKey, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.rankOrder - a.rankOrder);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [positions]);

  return (
    <div className="flex flex-col gap-6">
      {byFunction.map(([fn, seats]) => (
        <section key={fn}>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">
            {FUNCTION_LABELS[fn as BusinessFunction] ?? fn}
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {seats.map((seat) => {
              const rows = entries.filter((e) => e.positionId === seat.id);
              const seatHolders = holders.filter((h) => h.positionId === seat.id);
              const vacant = seatHolders.length === 0;
              const minutes = rows
                .filter((r) => r.isActive)
                .reduce((s, r) => s + r.estimatedMinutes, 0);
              // Where this seat's unassigned work goes while it is empty —
              // computed from a real entry so it uses the real ladder.
              const escalation = vacant && rows[0] ? whoDoesIt(rows[0], positions, holders) : null;

              return (
                <div
                  key={seat.id}
                  className={`rounded-2xl border bg-white p-4 ${
                    vacant ? "border-amber-300" : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-slate-900">{seat.title}</p>
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        {vacant ? "Vacant seat" : seatHolders.map((h) => h.name).join(", ")}
                      </p>
                    </div>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
                      {rows.length} JD{rows.length === 1 ? "" : "s"} · {minutes}m
                    </span>
                  </div>

                  {vacant && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      {escalation?.landedOn ? (
                        <>
                          Work here escalates to <b>{escalation.landedOn.title}</b> until
                          somebody is placed.
                        </>
                      ) : rows.length === 0 ? (
                        <>Nothing filed against this seat yet.</>
                      ) : (
                        <>
                          Nothing filled above it — these tasks land in the unassigned
                          queue.
                        </>
                      )}
                    </p>
                  )}

                  {rows.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1">
                      {rows.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => onOpen(e)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-slate-50 ${
                              e.isActive ? "text-slate-700" : "text-slate-400 line-through"
                            }`}
                          >
                            <span className="font-mono text-[10px] text-slate-400">
                              {e.serialNo}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{e.task}</span>
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {describeRecurrence(e.recurrence)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Summary strip ────────────────────────────────────────────────────────── */

export function JdSummary({
  entries,
  positions,
  holders,
}: {
  entries: JdEntryRow[];
  positions: JdPositionRow[];
  holders: SeatHolder[];
}) {
  const active = entries.filter((e) => e.isActive);
  const vacant = positions.filter(
    (p) => !holders.some((h) => h.positionId === p.id),
  ).length;
  const stranded = active.filter(
    (e) => whoDoesIt(e, positions, holders).via === "unassigned",
  ).length;
  const escalated = active.filter(
    (e) => whoDoesIt(e, positions, holders).via === "escalated",
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Active JDs" value={active.length} />
      <Stat label="Seats" value={positions.length} sub={`${vacant} vacant`} />
      <Stat
        label="Escalated"
        value={escalated}
        sub="covered by a senior"
        tone={escalated > 0 ? "#B45309" : undefined}
      />
      <Stat
        label="Unassigned"
        value={stranded}
        sub="nobody above the seat"
        tone={stranded > 0 ? ACCENT : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className="mt-0.5 text-[22px] font-black tabular-nums leading-none"
        style={{ color: tone ?? "#0F172A" }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}
