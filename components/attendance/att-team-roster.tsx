"use client";

import * as React from "react";
import {
  Search,
  X,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
  MoveRight,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PunchEditControl } from "@/components/attendance/punch-edit-control";

/** One punch, pre-formatted on the server so the roster stays render-only. */
export interface RosterPunch {
  label: string; // "09:42"
  /** "HH:mm" (24h) — prefills the super-admin edit control. */
  hhmm: string;
  verify: "biometric" | "gps_only" | "none";
  distanceM: number | null;
}

export interface RosterRow {
  employeeId: string;
  name: string;
  avatarUrl: string | null;
  in: RosterPunch | null;
  out: RosterPunch | null;
  note: string;
  /**
   * An APPROVED leave covering this date, if any. Without it a person on
   * sanctioned paid leave read as flatly "Absent" here — the same word, in the
   * same red, as someone who simply did not turn up. That is the one distinction
   * this board exists to make, so it is carried in the row rather than inferred.
   * Optional: callers that don't resolve leave (older call sites) are unchanged.
   */
  leave?: "paid" | "unpaid" | null;
}

/**
 * Premium team roster: searchable, checked-in progress header, status rows.
 * Quick-punch (super-admin, today only) keeps the existing TeamPunchButton.
 */
export function AttTeamRoster({
  rows,
  date,
  tz,
  canEdit,
}: {
  rows: RosterRow[];
  date: string;
  tz: string;
  /** Super-admin: each row's in/out becomes editable for the selected date. */
  canEdit: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

  const present = rows.filter((r) => r.in).length;
  const pct = rows.length > 0 ? present / rows.length : 0;
  const presentRows = rows.filter((r) => r.in);

  return (
    <div>
      {/* ── Header: count · % · progress · checked-in cluster ── */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-[180px] flex-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="tabular-nums text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 26,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {present}
            </span>
            <span className="text-[13px] font-semibold text-ink-subtle">of {rows.length} in</span>
            <span
              className="ml-1 rounded-pill px-2 py-0.5 text-[11px] font-black tabular-nums"
              style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
            >
              {Math.round(pct * 100)}%
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full max-w-[280px] overflow-hidden rounded-full"
            style={{ background: "var(--color-surface-soft)" }}
            role="progressbar"
            aria-valuenow={present}
            aria-valuemin={0}
            aria-valuemax={rows.length}
            aria-label={`${present} of ${rows.length} checked in`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.round(pct * 100)}%`, background: "linear-gradient(90deg, #22c55e, #15803d)" }}
            />
          </div>
        </div>

        {presentRows.length > 0 && <PresentCluster rows={presentRows} />}
      </div>

      {/* ── Search ── */}
      <label className="relative mb-3 flex h-10 w-full items-center" aria-label="Search team members">
        <Search size={15} strokeWidth={2.4} className="pointer-events-none absolute left-3 text-ink-subtle" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.stopPropagation();
              setQuery("");
            }
          }}
          placeholder="Local search - people" title="Local search - filters only the list on this page" aria-label="Local search - people - this page only"
          className="h-full w-full rounded-xl border-2 border-hairline-strong bg-white pl-9 pr-8 text-[14px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-[var(--color-altus-red)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 inline-grid size-6 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        )}
      </label>

      {/* ── Capped roster — the card stays compact; the list scrolls inside ── */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[14.5px] text-ink-subtle">No one matches “{query.trim()}”.</p>
      ) : (
        <div className="relative">
          <ul
            className="max-h-[344px] space-y-0.5 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-hairline-strong)_transparent]"
          >
            {filtered.map((r, i) => (
              <RosterItem key={r.employeeId} row={r} date={date} tz={tz} canEdit={canEdit} index={i} />
            ))}
          </ul>
          {/* bottom fade cue when the list overflows */}
          {filtered.length > 6 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-9 rounded-b-[18px]"
              style={{ background: "linear-gradient(to bottom, transparent, var(--color-surface-card))" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Overlapping avatars of the people currently checked in — a compact,
 *  premium "who's here" glance for the roster header. */
function PresentCluster({ rows }: { rows: RosterRow[] }) {
  const shown = rows.slice(0, 6);
  const extra = rows.length - shown.length;
  return (
    <div className="flex items-center" aria-label={`${rows.length} checked in`}>
      <div className="flex -space-x-2.5">
        {shown.map((r) => (
          <span
            key={r.employeeId}
            className="inline-grid place-items-center rounded-full ring-2 ring-white"
            title={r.name}
            style={{ boxShadow: "0 2px 6px -2px rgba(15,23,42,0.25)" }}
          >
            <Avatar name={r.name} avatarUrl={r.avatarUrl} size={30} />
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span
          className="ml-1.5 inline-grid size-[30px] place-items-center rounded-full text-[11.5px] font-black tabular-nums ring-2 ring-white"
          style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function RosterItem({
  row: r,
  date,
  tz,
  canEdit,
  index,
}: {
  row: RosterRow;
  date: string;
  tz: string;
  canEdit: boolean;
  index: number;
}) {
  // An approved leave outranks the punch record for anyone who didn't come in:
  // it is the REASON they are not here, and it is what payroll will act on.
  // Someone who punched in anyway is still shown as present — the leave did not
  // happen, and the grader agrees (a punch on a leave day is graded on merit).
  const status = r.in && r.out
    ? { label: "Checked Out", accent: "#334155", live: false }
    : r.in
      ? { label: "In Office", accent: "#16a34a", live: true }
      : r.leave === "paid"
        ? { label: "Paid Leave", accent: "#7c3aed", live: false }
        : r.leave === "unpaid"
          ? { label: "Unpaid Leave", accent: "var(--color-altus-red)", live: false }
          : { label: "Absent", accent: "var(--color-altus-red)", live: false };

  return (
    <li
      className="wg-rise relative flex items-center gap-2.5 rounded-xl py-2 pl-4 pr-2.5 transition-colors hover:bg-surface-soft max-md:flex-wrap"
      style={{ animationDelay: `${Math.min(index, 10) * 20}ms` }}
    >
      {/* status stripe */}
      <span
        aria-hidden
        className="absolute left-1 top-1.5 bottom-1.5 w-[3px] rounded-full"
        style={{
          background: `linear-gradient(180deg, ${status.accent}, color-mix(in srgb, ${status.accent} 45%, transparent))`,
        }}
      />

      <Avatar name={r.name} avatarUrl={r.avatarUrl} size={32} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-bold text-ink-strong">{r.name}</div>
        {r.note ? (
          <div className="truncate text-[12px] text-ink-subtle" title={r.note}>
            {r.note}
          </div>
        ) : (
          <div
            className="inline-flex items-center gap-1.5 text-[11.5px] font-bold"
            style={{ color: status.accent }}
          >
            {status.live && (
              <span aria-hidden className="relative inline-flex size-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:hidden"
                  style={{ background: status.accent }}
                />
                <span
                  className="relative inline-flex size-1.5 rounded-full"
                  style={{ background: status.accent }}
                />
              </span>
            )}
            {status.label}
          </div>
        )}
      </div>

      {/* in → out — editable (super-admin) or read-only chips */}
      <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:justify-end">
        {canEdit ? (
          <PunchEditControl employeeId={r.employeeId} logDate={date} kind="in" current={r.in?.hhmm ?? null} compact />
        ) : r.in ? (
          <RosterChip kind="in" punch={r.in} />
        ) : (
          <span
            className="inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-bold"
            style={
              r.leave === "paid"
                ? {
                    background: "color-mix(in srgb, #7c3aed 10%, transparent)",
                    color: "#6d28d9",
                  }
                : {
                    background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
                    color: "var(--color-altus-red)",
                  }
            }
          >
            {r.leave === "paid" ? "Paid Leave" : r.leave === "unpaid" ? "Unpaid Leave" : "Absent"}
          </span>
        )}

        <MoveRight aria-hidden size={13} strokeWidth={2.2} className="text-ink-subtle max-sm:hidden" />

        {canEdit ? (
          <PunchEditControl employeeId={r.employeeId} logDate={date} kind="out" current={r.out?.hhmm ?? null} compact />
        ) : r.out ? (
          <RosterChip kind="out" punch={r.out} />
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-semibold text-ink-subtle"
            style={{ background: "var(--color-surface-soft)" }}
          >
            <LogOut size={12} strokeWidth={2.4} /> -
          </span>
        )}
      </div>
    </li>
  );
}

function RosterChip({ kind, punch }: { kind: "in" | "out"; punch: RosterPunch }) {
  const Icon = kind === "in" ? LogIn : LogOut;
  const accent = kind === "in" ? "#16a34a" : "var(--color-altus-red)";
  const dist = punch.distanceM != null ? ` · ${Math.round(punch.distanceM)}m from office` : "";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums"
      style={{ background: `color-mix(in srgb, ${accent} 9%, transparent)`, color: accent }}
    >
      <Icon size={12} strokeWidth={2.6} />
      {punch.label}
      {punch.verify === "biometric" ? (
        <span title={`Biometric-verified${dist}`} aria-label={`Biometric-verified${dist}`} className="inline-flex">
          <ShieldCheck size={12} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} />
        </span>
      ) : punch.verify === "gps_only" ? (
        <span title={`Location-verified${dist}`} aria-label={`Location-verified${dist}`} className="inline-flex">
          <MapPin size={12} strokeWidth={2.6} style={{ color: "var(--color-blue-deep)" }} />
        </span>
      ) : null}
    </span>
  );
}
