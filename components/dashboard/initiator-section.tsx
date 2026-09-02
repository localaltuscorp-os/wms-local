"use client";

import * as React from "react";
import { Plus, Minus, ChevronDown } from "lucide-react";
import type { InitiatorBoard, InitiatorScorecard } from "@/lib/types";

const GREEN = "var(--color-green-deep, #15803D)";
const AMBER = "var(--color-amber-deep, #B45309)";
const RED = "var(--color-red-deep, #B91C1C)";

/** Colour an attainment %: green ≥100 (target hit), amber 60–99, red below. */
function attainmentColor(pct: number): string {
  if (pct >= 100) return GREEN;
  if (pct >= 60) return AMBER;
  return RED;
}

/**
 * Manager Initiator — are managers pushing work DOWN to their direct reports?
 * A collapsed-by-default section (the body is not mounted until opened, like
 * NotApprovedSection / DoneAgingSection). The
 * `Last 3 days ⇄ Last 7 days` toggle picks the active board. For each manager
 * we show a target-vs-actual progress bar (target = 3 tasks/working-day/report)
 * coloured by attainment, three category chips (Direct Reports counts toward
 * target; Counterparts and Founder/Mgmt do not) plus a total, and an
 * expandable per-report breakdown. Admins see every manager; a non-admin sees
 * ONLY their own scorecard.
 */
export function InitiatorSection({
  data,
  isAdmin,
  meId,
}: {
  data: { d3: InitiatorBoard; d7: InitiatorBoard };
  isAdmin: boolean;
  meId: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [windowKey, setWindowKey] = React.useState<"d3" | "d7">("d7");

  const board = data[windowKey];

  return (
    <section className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12 max-md:mt-6">
      <div
        className="bg-surface-card rounded-section overflow-hidden"
        style={{
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="initiator-body"
          className="w-full flex items-center justify-between gap-4 p-8 max-md:p-5 text-left transition-colors hover:bg-surface-subtle/40"
        >
          <div className="min-w-0">
            <h2 className="text-display-lg text-ink-strong">
              <span aria-hidden className="mr-2">🧭</span>Manager Initiator
            </h2>
            <p className="text-body-lg text-ink-subtle mt-1">
              Are managers pushing work down to their teams? Target vs actual.{" "}
              <span className="font-semibold text-ink-soft">
                {open ? "Click to hide." : "Click to view."}
              </span>
            </p>
          </div>
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-all"
            style={{
              background: open
                ? "var(--color-altus-red)"
                : "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: open ? "#fff" : "var(--color-altus-red)",
            }}
          >
            {open ? (
              <Minus size={22} strokeWidth={2.6} />
            ) : (
              <Plus size={22} strokeWidth={2.6} />
            )}
          </span>
        </button>

        {open && (
          <div
            id="initiator-body"
            className="border-t border-hairline p-8 max-md:p-5"
          >
            <WindowToggle value={windowKey} onChange={setWindowKey} />
            <p className="mt-4 text-[12.5px] font-semibold text-ink-subtle">
              Target = 3 tasks × {board.workingDays} working{" "}
              {board.workingDays === 1 ? "day" : "days"} × direct reports (Sun
              off).
            </p>
            <div className="mt-6">
              <Board board={board} isAdmin={isAdmin} meId={meId} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: "d3" | "d7";
  onChange: (v: "d3" | "d7") => void;
}) {
  const options: { id: "d3" | "d7"; label: string }[] = [
    { id: "d3", label: "Last 3 days" },
    { id: "d7", label: "Last 7 days" },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-chip bg-surface-card border border-hairline"
      role="tablist"
      aria-label="Time window"
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className="px-4 py-2 rounded-pill font-bold transition-all duration-200 tabular-nums"
            style={{
              fontSize: 14,
              background: active ? "var(--color-ink-strong)" : "transparent",
              color: active ? "#ffffff" : "var(--color-ink-muted)",
              boxShadow: active ? "0 4px 10px rgba(15,23,42,0.18)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Board({
  board,
  isAdmin,
  meId,
}: {
  board: InitiatorBoard;
  isAdmin: boolean;
  meId: string | null;
}) {
  // PRIVACY: admins see every manager; a non-admin sees ONLY their own
  // scorecard. A null meId yields no cards.
  const managers = isAdmin
    ? board.managers
    : board.managers.filter((m) => m.managerId === meId);

  if (board.managers.length === 0) {
    return (
      <p className="text-[14px] font-semibold text-ink-subtle">
        No managers with direct reports yet — assign reporting lines in Admin →
        Employees.
      </p>
    );
  }

  if (managers.length === 0) {
    return (
      <p className="text-[14px] font-semibold text-ink-subtle">
        You have no direct reports on record — nothing to score here.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
      {managers.map((m) => (
        <ManagerCard key={m.managerId} manager={m} />
      ))}
    </div>
  );
}

function ManagerCard({ manager: m }: { manager: InitiatorScorecard }) {
  const [showReports, setShowReports] = React.useState(false);
  const color = attainmentColor(m.attainmentPct);
  const barW = Math.min(m.attainmentPct, 100);

  return (
    <div
      className="rounded-2xl border bg-surface-card p-5 max-md:p-4"
      style={{
        borderColor: "var(--color-hairline-strong)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
      }}
    >
      {/* ── Header: name + actual / target ── */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="truncate text-[16px] font-black tracking-tight text-ink-strong leading-tight"
            title={m.managerName}
          >
            {m.managerName}
          </h3>
          <p className="mt-1 text-[11.5px] font-semibold text-ink-subtle leading-none">
            {m.directReports} direct{" "}
            {m.directReports === 1 ? "report" : "reports"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className="tabular-nums leading-none"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 28,
              letterSpacing: "-0.02em",
              color,
            }}
          >
            {m.actual}
          </span>
          <span className="text-[15px] font-bold text-ink-subtle tabular-nums">
            {" "}
            / {m.target}
          </span>
          <p
            className="mt-0.5 text-[12px] font-black tabular-nums leading-none"
            style={{ color }}
          >
            {m.attainmentPct}%
          </p>
        </div>
      </div>

      {/* ── Attainment bar ── */}
      <div
        className="mt-3 h-3 w-full overflow-hidden rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
        }}
      >
        <span
          className="block h-full transition-all"
          style={{ width: `${barW}%`, background: color }}
        />
      </div>

      {/* ── Category chips ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip
          label="Direct Reports"
          value={m.toDirectReports}
          highlight
          title="Tasks pushed to direct reports — these count toward the target"
        />
        <Chip label="Counterparts" value={m.toCounterparts} />
        <Chip label="Founder/Mgmt" value={m.toFounderMgmt} />
        <Chip label="Total" value={m.totalInitiated} />
      </div>

      {/* ── Per-report breakdown (expandable) ── */}
      {m.perReport.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowReports((s) => !s)}
            aria-expanded={showReports}
            className="bg-surface-card inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
          >
            <ChevronDown
              size={14}
              strokeWidth={2.6}
              className="transition-transform"
              style={{ transform: showReports ? "rotate(180deg)" : "none" }}
            />
            {showReports ? "Hide" : "Show"} per-report breakdown
          </button>

          {showReports && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {m.perReport.map((r) => (
                <li
                  key={r.employeeId}
                  className="flex items-center gap-3 text-[13px]"
                >
                  <span
                    className="min-w-0 flex-1 truncate font-bold text-ink-strong"
                    title={r.employeeName}
                  >
                    {r.employeeName}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink-subtle">
                    {r.given}/{r.goal}
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-[14px] leading-none"
                  >
                    {r.hit ? "✅" : "❌"}
                  </span>
                  <span className="sr-only">
                    {r.hit ? "goal met" : "goal not met"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  highlight = false,
  title,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold"
      style={
        highlight
          ? {
              color: "var(--color-altus-red)",
              background:
                "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--color-altus-red) 28%, transparent)",
            }
          : {
              color: "var(--color-ink-soft)",
              background: "var(--color-surface-subtle)",
              border: "1px solid var(--color-hairline)",
            }
      }
    >
      {label}
      <span className="font-black tabular-nums text-ink-strong">{value}</span>
    </span>
  );
}
