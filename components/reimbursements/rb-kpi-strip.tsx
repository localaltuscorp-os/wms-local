"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { ClaimFilter } from "@/lib/reimbursements/claim-status";
import { CLAIM_FILTER_LABELS } from "@/lib/reimbursements/claim-status";
import { useClaimFilter } from "./rb-filter-context";

/**
 * The reimbursement KPI strip — every card is a FILTER.
 *
 * ── WHAT EACH CARD FILTERS TO, AND WHY ─────────────────────────────────────
 * Each card filters to ITS OWN definition, read off what the card actually
 * totals rather than guessed from its title:
 *
 *   · "Total claimed"  → every claim. Its value is Σ over all rows.
 *   · "Pending"        → status pending. Its value is Σ over pending rows.
 *   · "Approved · paid"→ status approved, SETTLED OR NOT (`approvedAll`). Its
 *                        value is Σ over `status === "approved"`, which includes
 *                        the settled ones — so filtering to the narrower
 *                        "approved but unpaid" would show a total the list
 *                        could not account for. The Paid chip in the toolbar is
 *                        still there for the settled subset.
 *   · "Claims"         → every claim. Its value is the count of all rows.
 *
 * Two cards therefore land on "all", because two cards genuinely describe the
 * whole set (one in rupees, one as a count). That redundancy is the existing
 * KPI design's, and reporting it honestly beats inventing a filter neither card
 * measures — a card reading "12" that produced 2 rows would be the exact
 * inconsistency clickable KPIs are supposed to remove.
 *
 * ── PRESENTATION ONLY ──────────────────────────────────────────────────────
 * The VALUES are computed on the server, over every row, and passed in. They do
 * not change when a filter is applied — a strip that recomputed itself against
 * the selection would zero every card but the chosen one.
 */

export interface RbKpi {
  key: string;
  /** Which filter this card selects. */
  filter: ClaimFilter;
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
}

export function RbKpiStrip({ kpis }: { kpis: RbKpi[] }) {
  const { filter, toggleFilter } = useClaimFilter();

  return (
    <section
      aria-label="Reimbursement totals"
      className="mb-6 grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1"
    >
      {kpis.map((k, i) => (
        <KpiCard
          key={k.key}
          kpi={k}
          delay={i * 50}
          // "all" is the resting state, so the two whole-set cards must not
          // both light up as "a filter is on" — nothing is being filtered.
          active={filter !== "all" && filter === k.filter}
          onSelect={() => toggleFilter(k.filter)}
        />
      ))}
    </section>
  );
}

/* ── KPI card — the same construction as the Attendance / Salary stat cards,
     now a button. Styling is unchanged; only the shell and the active ring
     are new. ── */

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
  const { icon, accent, label, value, caption, progress, filter } = kpi;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      // Names the RESULT, not the widget: a screen-reader user needs to know
      // what pressing this does to the list below, and that it toggles.
      aria-label={
        active
          ? `${label}: ${value}. Filtering by ${CLAIM_FILTER_LABELS[filter]}. Activate to clear the filter.`
          : `${label}: ${value}. Activate to filter claims by ${CLAIM_FILTER_LABELS[filter]}.`
      }
      title={
        active
          ? "Filtering by this — click again to clear"
          : `Filter claims by ${CLAIM_FILTER_LABELS[filter]}`
      }
      className="wg-rise wg-btn cursor-pointer rounded-2xl bg-surface-card px-4.5 py-4 text-left transition-shadow max-md:px-4"
      style={{
        boxShadow: active
          ? `inset 0 0 0 2px ${accent}, inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -18px color-mix(in srgb, ${accent} 60%, transparent)`
          : "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{
            background: active ? accent : `color-mix(in srgb, ${accent} 10%, transparent)`,
            color: active ? "#fff" : accent,
          }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
        {/* The active marker. A ring alone reads as hover on a card that is
            already interactive, so the state is also said in a word. */}
        {active && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.1em] text-white"
            style={{ background: accent }}
          >
            <Check size={9} strokeWidth={3.4} aria-hidden />
            On
          </span>
        )}
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(21px, 1.7vw, 27px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 75%, #fff), ${accent})`,
            }}
          />
        </div>
      )}
    </button>
  );
}
