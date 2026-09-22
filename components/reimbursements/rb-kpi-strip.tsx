"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { ClaimFilter } from "@/lib/reimbursements/claim-status";
import { CLAIM_FILTER_LABELS } from "@/lib/reimbursements/claim-status";
import { statusCardTokens, type StatusCardKey } from "@/lib/status-palette";
import { useClaimFilter } from "./rb-filter-context";

/**
 * THE REIMBURSEMENT KEY CARDS — every card is the filter for one claim state.
 *
 * ── WHAT CHANGED, AND WHY (2026-09-21) ────────────────────────────────────
 * Four cards became five, and the set now PARTITIONS the book: Pending,
 * Approved, Paid and Rejected add up to Total, in money and in count. Before,
 * "Total claimed" and "Claims" both filtered to every row — a quarter of the
 * strip restating the first card's own caption — while Rejected, a real state
 * with real money in it, had no card at all. `lib/reimbursements/claim-kpis.ts`
 * owns the arithmetic and the mapping, so the figures cannot drift from the
 * lists they filter to, or from the badges on the rows below.
 *
 * ── COLOUR COMES FROM THE SHARED PALETTE ──────────────────────────────────
 * Not one hex in this file. The cards were painted from a private
 * `const GREEN = "#16a34a"` that also existed, separately, in the claims list —
 * two copies of a palette, which is how a colour system dies. They read
 * `statusCardTokens` now, the same pale containers the rest of the app's KPI
 * cards use.
 *
 * ── PRESENTATION ONLY ─────────────────────────────────────────────────────
 * The VALUES are computed on the server over every row and passed in. They do
 * not move when a filter is applied — a strip that recomputed itself against
 * the selection would zero every card but the chosen one.
 */

export interface RbKpi {
  key: string;
  /** Which filter this card selects. */
  filter: ClaimFilter;
  /** The shared palette slot this card is painted from. */
  card: StatusCardKey;
  icon: React.ReactNode;
  label: string;
  /** Already formatted — ₹ for the money cards. */
  value: string;
  caption: string;
  /** How many rows this card describes. A card for an EMPTY state goes inert:
   *  "0 rejected" is worth being told, but filtering to it produces nothing. */
  count: number;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
}

export function RbKpiStrip({ kpis }: { kpis: RbKpi[] }) {
  const { filter, toggleFilter } = useClaimFilter();

  return (
    <section
      aria-label="Reimbursement totals"
      /* ONE LINE — five cards, five states, read left to right in the order a
         claim actually moves through them. The break is at `lg` (1024px), not
         `xl`: at xl the row split into 4 + 1 on an ordinary laptop, which is
         the worst of both layouts. Below 1024 it wraps 3 then 2, never to a
         column of five full-width blocks. */
      className="mb-5 grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2"
    >
      {kpis.map((k, i) => (
        <KpiCard
          key={k.key}
          kpi={k}
          delay={i * 45}
          // "all" is the resting state: the Total card must not light up as
          // "a filter is on" when nothing is being filtered.
          active={filter !== "all" && filter === k.filter}
          onSelect={() => toggleFilter(k.filter)}
        />
      ))}
    </section>
  );
}

function KpiCard({
  kpi,
  delay,
  active,
  onSelect,
}: {
  kpi: RbKpi;
  delay: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { icon, card, label, value, caption, progress, filter, count } = kpi;
  const t = statusCardTokens(card);
  // The Total card stays live at zero — clicking it clears the filter, which is
  // still a useful thing to be able to do on an empty book.
  const inert = count === 0 && filter !== "all";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={inert}
      aria-pressed={active}
      // Names the RESULT, not the widget: a screen-reader user needs to know
      // what pressing this does to the list below, and that it toggles.
      aria-label={
        inert
          ? `${label}: ${value}. No claims in this state.`
          : active
            ? `${label}: ${value}. Filtering by ${CLAIM_FILTER_LABELS[filter]}. Activate to clear the filter.`
            : `${label}: ${value}. Activate to filter claims by ${CLAIM_FILTER_LABELS[filter]}.`
      }
      title={
        inert
          ? "No claims in this state"
          : active
            ? "Filtering by this — click again to clear"
            : `Filter claims by ${CLAIM_FILTER_LABELS[filter]}`
      }
      className={`wg-rise rounded-xl border p-3.5 text-left shadow-sm transition max-md:p-3 ${t.shell} ${
        active ? `ring-2 ring-inset ${t.ring}` : ""
      } ${inert ? "cursor-default opacity-55" : "wg-btn cursor-pointer hover:shadow-md"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex items-center gap-1.5">
        <span className={`inline-grid size-6 shrink-0 place-items-center rounded-md ${t.badge}`}>
          {icon}
        </span>
        <span
          className={`truncate text-[10.5px] font-bold uppercase tracking-[0.07em] ${t.label}`}
        >
          {label}
        </span>
        {/* The active marker. A ring alone reads as hover on a card that is
            already interactive, so the state is also said in a word — and it
            survives a screenshot, where a tint difference may not. */}
        {active && (
          <span
            className={`ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${t.badgeActive}`}
          >
            <Check size={9} strokeWidth={3.4} aria-hidden />
            On
          </span>
        )}
      </span>

      <span
        className={`mt-2 block tabular-nums leading-none ${t.value}`}
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(19px, 1.5vw, 25px)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>

      <span className={`mt-1 block text-[11.5px] font-medium ${t.sub}`}>{caption}</span>

      {progress != null && (
        <span
          className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/70"
          aria-hidden
        >
          <span
            className={`block h-full rounded-full ${t.badgeActive}`}
            style={{ width: `${Math.max(3, Math.min(100, progress * 100))}%` }}
          />
        </span>
      )}
    </button>
  );
}
