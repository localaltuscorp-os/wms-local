"use client";

import * as React from "react";
import { DataTable } from "@/components/admin/ui/data-table";
import { IncentiveBadge } from "@/components/incentive/ui/badges";
import type { Tone } from "@/components/incentive/ui/tone";
import { formatInr } from "@/lib/format";
import type { MyIncentiveRow } from "@/lib/queries/my-incentives";
import type { EligibilityReason } from "@/lib/incentive/master";

/**
 * MY INCENTIVES — the employee-facing answer to two questions:
 *
 *   "Which incentives can I earn?"   → the table, eligible rows only
 *   "How much does each one pay?"    → the Rate column, read live from the
 *                                      Incentive Master, never a copy
 *
 * ── WHY THERE IS ALSO A "NOT AVAILABLE TO YOU" GROUP ───────────────────────
 * Hiding the incentives somebody cannot claim sounds kind, and produces the
 * question this page exists to answer: "the referral is ₹2,000, why is it not
 * in my list?" So the ineligible rows stay on the page, in a group that is
 * CLOSED by default, each carrying the rule's own reason — "Interns are not
 * eligible", "Not your function", "Not on offer". The reason text comes from
 * the resolver, so it cannot drift from the rule that actually decided it.
 *
 * ── WHY THE BADGE TONE IS LOCAL, NOT `STATUS_TONE` ─────────────────────────
 * `STATUS_TONE` is typed on the request workflow's states and every key must be
 * present — a "you are eligible" state does not belong in it, and adding one
 * would weaken the exhaustiveness that keeps that map honest. These are the page's
 * own two states, so they get their own small map.
 */
const ROW_TONE: Record<"eligible" | "intern" | "inactive" | "scope" | "offer", Tone> = {
  eligible: "green",
  // Amber for an intern: their status is a fact about them, not an error, and
  // red would read as a mistake in the record.
  intern: "amber",
  inactive: "slate",
  scope: "slate",
  offer: "amber",
};

function toneFor(reason: EligibilityReason): Tone {
  if (reason === "intern") return ROW_TONE.intern;
  if (reason === "inactive") return ROW_TONE.inactive;
  if (reason === "not_on_offer") return ROW_TONE.offer;
  return ROW_TONE.scope;
}

export function MyIncentives({ rows }: { rows: MyIncentiveRow[] }) {
  const eligible = rows.filter((r) => r.eligible);
  const others = rows.filter((r) => !r.eligible);
  const [openOthers, setOpenOthers] = React.useState(false);

  const columns = [
    {
      key: "name",
      label: "Incentive",
      sortValue: (r: MyIncentiveRow) => r.name,
      render: (r: MyIncentiveRow) => (
        <span>
          <span className="font-semibold text-ink-strong">{r.name}</span>
          {r.description && (
            <span className="block text-[12px] text-ink-subtle">{r.description}</span>
          )}
        </span>
      ),
    },
    {
      key: "rate",
      label: "Rate / Pay",
      align: "right" as const,
      sortValue: (r: MyIncentiveRow) => r.rate,
      render: (r: MyIncentiveRow) => (
        <span className="tabular-nums font-semibold text-ink-strong">{formatInr(r.rate)}</span>
      ),
    },
    {
      key: "appliesTo",
      label: "Eligibility",
      sortValue: (r: MyIncentiveRow) => r.appliesTo,
      render: (r: MyIncentiveRow) => <span className="text-ink-soft">{r.appliesTo}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortValue: (r: MyIncentiveRow) => (r.eligible ? 0 : 1),
      render: (r: MyIncentiveRow) =>
        r.eligible ? (
          <IncentiveBadge tone={ROW_TONE.eligible}>Eligible</IncentiveBadge>
        ) : (
          <IncentiveBadge tone={toneFor(r.reasonCode)}>{r.reason}</IncentiveBadge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataTable<MyIncentiveRow>
        rows={eligible}
        columns={columns}
        getRowKey={(r) => r.catalogId}
        searchText={(r) => [r.name, r.description ?? "", r.appliesTo].join(" ")}
        searchPlaceholder="Search your incentives…"
        initialSort={{ key: "name", dir: "asc" }}
        emptyState={
          <div className="py-10 text-center">
            <p className="text-[14px] font-semibold text-ink-strong">
              No incentives are available to you right now.
            </p>
            <p className="mt-1 text-[12.5px] text-ink-subtle">
              Your Incentive Master is maintained by the Admin Panel. If you
              expected something here, the list below says why each one is not.
            </p>
          </div>
        }
      />

      {others.length > 0 && (
        <section className="glass rounded-xl">
          <button
            type="button"
            onClick={() => setOpenOthers((v) => !v)}
            aria-expanded={openOthers}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-[13px] font-bold text-ink-soft">
              Not available to you ({others.length})
            </span>
            <span className="text-[12px] text-ink-subtle">{openOthers ? "Hide" : "Show"}</span>
          </button>

          {openOthers && (
            <div className="px-2 pb-3">
              <DataTable<MyIncentiveRow>
                rows={others}
                columns={columns}
                getRowKey={(r) => r.catalogId}
                dense
                searchText={(r) => [r.name, r.reason].join(" ")}
                searchPlaceholder="Search the other incentives…"
                initialSort={{ key: "name", dir: "asc" }}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
