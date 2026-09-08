"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { XCircle } from "lucide-react";
import { FineBucketBars } from "@/components/dashboard/task-report/fine-bucket-bars";
import { Avatar } from "@/components/ui/avatar";
import type { FineBucketCount } from "@/lib/transforms/aging-buckets-fine";
import type { NotApprovedPersonRow } from "@/lib/queries/task-report";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD_PADDED,
  SectionSearchBox,
} from "@/components/dashboard/section-chrome";
import { matchesSearch } from "@/lib/client/section-search";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import type { SectionReport } from "@/lib/reports/section-report";
import { PageShell } from "@/components/layout/page-shell";
import { SectionIcon } from "@/components/dashboard/section-icon";

/**
 * SENT-BACK WORK — who is carrying declined tasks, and how overdue they are.
 *
 * Moved here from the Task Analytics report. `NotApprovedPanel` is carried over
 * unchanged — same person list, same fine-bucket aging, same links — because
 * the brief was placement, not redesign.
 *
 * As with the delivery spread, the report's `ReportSection` chrome could not
 * come along: it is shared with that page's other sections. The dashboard's own
 * header + collapse wrap it instead, so this folds like every other section
 * here.
 */
export function SentBackSection({
  total,
  byPerson,
  buckets,
  undated,
  isAdmin,
  meId,
  avatarById,
}: {
  total: number;
  byPerson: NotApprovedPersonRow[];
  buckets: FineBucketCount[];
  undated: number;
  isAdmin: boolean;
  meId: string | null;
  /**
   * A PLAIN OBJECT, not a lookup function.
   *
   * This prop used to be `resolveAvatar: (id) => string | null`, handed down
   * from the dashboard page — an async SERVER component — to this one, which
   * is `"use client"`. Functions cannot cross that boundary: React has to
   * serialise every prop into the RSC payload and throws
   * "Functions cannot be passed directly to Client Components" when it meets
   * one. The throw happened while RENDERING, so the page's try/catch (which
   * only wraps the data FETCH) never saw it and <WidgetBoundary> caught it
   * instead — which is why this card, and only this card, showed
   * "Unable to load sent-back work" while the query underneath was fine.
   *
   * Every sibling widget on the page — AgingHeatmap, StatusTable,
   * TopPerformersSection — already takes the map itself. This one now matches
   * them, which is also what stops the mistake being made again: there is no
   * function left to pass.
   */
  avatarById: Record<string, string | null>;
}) {
  const [open, setOpen] = React.useState(true);
  // Lives HERE, not in the panel below, because the box that drives it sits in
  // this section's header. The panel receives it and does the filtering, where
  // the roster and the privacy rule already are.
  const [query, setQuery] = React.useState("");

  /* Mirrors the panel below: the same privacy filter, then the same search.
     Duplicating the RULE would be a bug waiting to happen, so both sides run
     the identical two expressions in the identical order. */
  const buildReport = React.useCallback((): SectionReport => {
    const all = byPerson ?? [];
    const permitted = isAdmin ? all : all.filter((p) => p.employeeId === meId);
    const people = query.trim()
      ? permitted.filter((p) => matchesSearch(query, p.employeeName))
      : permitted;
    return {
      title: "Sent-back Work",
      subtitle: "Tasks an Admin declined and returned, by who is carrying them",
      meta: query.trim() ? [{ label: "Search", value: query.trim() }] : [],
      summary: `${people.length} ${people.length === 1 ? "person" : "people"} · ${total} sent back`,
      columns: [
        { label: "Person", weight: 3, align: "left" },
        { label: "Sent back", weight: 1, align: "right" },
      ],
      rows: people.map((p) => [p.employeeName, String(p.count ?? 0)]),
    };
  }, [byPerson, isAdmin, meId, query, total]);

  return (
    <PageShell as="section" width="full" py={false} aria-label="Sent-Back Work">
      <DashboardSectionHeader
        icon={<SectionIcon icon={XCircle} tone="red" />}
        /* NO `inset` OVERRIDE ANY MORE — this was the only header on the
           dashboard that carried one.

           Its reasoning was locally sound: the card below used `p-8 md:p-10`
           rather than the standard `p-6 md:p-8`, so the header inset to match
           its own card. But that traded ONE alignment for a worse one. It kept
           this title level with the card 8px beneath it, at the cost of
           standing 8px right of the other nine titles running down the page —
           and a stack of headings is read against each other, not against the
           card each one sits on. The fix is to make the card standard rather
           than the header bespoke; see the card below. */
        title="Sent-Back Work, by Person and by How Overdue"
        subtitle="Tasks an Admin declined and returned. Left: who is carrying them · Right: aged against each task's effective due date (red = overdue)."
        actions={
          <>
          <SectionDispatch report={buildReport} />
          <SectionSearchBox
            query={query}
            onQuery={setQuery}
            placeholder="Search person..."
          />
          <CollapseToggle
            expanded={open}
            onToggle={() => setOpen((v) => !v)}
            label="sent-back work"
          />
          </>
        }
      />
      <CollapsibleBody expanded={open}>
        {/* STANDARD PADDING, so this card's content edge lines up with every
            other card's and the header above needs no bespoke inset. It was
            `p-8 md:p-10` — 8px more than the dashboard standard, which is what
            forced the header override this section used to carry.

            The `min-h` floor below is unrelated and stays: it keeps this level
            with the Aging Heatmap above rather than ending short and leaving
            the column ragged. `min-h`, not `h`, so a short roster still
            shrinks to fit rather than opening a void under the rows. */}
        <div
          className={`${DASHBOARD_CARD_PADDED} ${
            /* Only when there are enough ROWS to fill it — not merely when the
               count is non-zero.

               `total > 0` was the wrong test: one person carrying one sent-back
               task satisfies it, and the card then drew a single row above half
               a screen of white inside its own border. That was rare while the
               board always showed the whole org; now that the employee filter
               reaches every section, a one-row board is an ordinary thing to be
               looking at. Seven rows is where the tall layout starts earning
               its floor. */
            byPerson.length > 6 ? "min-h-[580px]" : ""
          }`}
        >
          <NotApprovedPanel
            total={total}
            byPerson={byPerson}
            query={query}
            buckets={buckets}
            undated={undated}
            isAdmin={isAdmin}
            meId={meId}
            avatarById={avatarById}
          />
        </div>
      </CollapsibleBody>
    </PageShell>
  );
}

/* Carried over from task-report-view. GlassCard is the inner shell the panel
   was written against; it stays so the panel renders exactly as it did. */
const RED = "var(--color-altus-red, #E10600)";

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm max-md:p-5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      <span
        className="inline-flex size-12 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-ink-subtle) 12%, transparent)",
          color: "var(--color-ink-subtle)",
        }}
      >
        {icon}
      </span>
      <p
        className="text-ink-strong"
        style={{ fontFamily: "var(--font-serif), serif", fontWeight: 700, fontSize: 18 }}
      >
        {title}
      </p>
      <p className="max-w-[420px] text-[13px] font-semibold text-ink-subtle">{body}</p>
    </div>
  );
}

function NotApprovedPanel({
  query,
  total,
  byPerson,
  buckets,
  undated,
  isAdmin,
  meId,
  avatarById,
}: {
  total: number;
  byPerson: NotApprovedPersonRow[];
  buckets: FineBucketCount[];
  undated: number;
  isAdmin: boolean;
  meId: string | null;
  avatarById: Record<string, string | null>;
  /** The header's search text. Applied AFTER the privacy filter below, so a
   *  search can never surface a row the reader is not allowed to see. */
  query: string;
}) {
  // Defaulted at the point of USE, not just at the call site. `byPerson` and
  // `buckets` arrive from a 60s-memoised payload that a previous deploy may
  // have shaped differently, and `.filter` on an absent array throws during
  // render — the failure mode this whole section just spent a bug on.
  const rows = byPerson ?? [];
  // Privacy FIRST, search second: admins see everyone, a non-admin sees only
  // their own row, and the search then narrows whatever that left.
  const permitted = isAdmin ? rows : rows.filter((p) => p.employeeId === meId);
  const people = query.trim()
    ? permitted.filter((p) => matchesSearch(query, p.employeeName))
    : permitted;

  if (total === 0) {
    return (
      <GlassCard>
        <EmptyState
          icon={<XCircle size={24} strokeWidth={2.2} />}
          title="No tasks awaiting re-work"
          body="Nothing has been sent back for correction. When an admin declines a task it appears here, by person and by how overdue it is."
        />
      </GlassCard>
    );
  }

  // Seeded with 1 so an all-zero list cannot divide by zero, and spread LAST
  // so a long roster cannot blow the argument limit ahead of the seed.
  const maxCount = Math.max(1, ...people.map((p) => p.count ?? 0));

  return (
    /* 5/7 in twelfths, not a rigid 50/50. The right half carries nine bucket
       rows whose labels run to "1 to 3 days before due date" — the longest
       string in the section — while the left carries a name and a bar. An even
       split starved the side with more to say. Same grid vocabulary as Top
       Performers and Delivered on Time, so the three sections' gutters line up
       down the page. One column below `lg`, where neither half would be
       legible side by side. */
    <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
      {/* LEFT — person-wise */}
      <GlassCard className="lg:col-span-5">
        {/* The count moves to the RIGHT of its own header row, in a pill.
        
            It used to run inline after the label — "By person · most first  63
            total" — where it read as a continuation of the caption rather than
            as the section's headline figure, at 10.5px in the same muted grey
            as the words around it. Pushed to the opposite end and given the
            crimson pill, it becomes the thing the eye lands on, which is what
            it is: the number every row underneath adds up to.
        
            The rule underneath closes the header as a band, matching what
            DashboardSectionHeader does one level up. */}
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            By person · most first
          </span>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1"
            style={{
              /* The BRAND red via its token, not Tailwind's red-50/200/600 —
                 those are a different hue from #E10600 and this pill sits a few
                 pixels from the bars below it, which are painted from the
                 token. Two reds that close together read as a rendering fault
                 rather than as two colours. */
              background: "color-mix(in srgb, var(--color-altus-red) 7%, white)",
              borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, transparent)",
            }}
          >
            <span
              className="text-sm font-black tabular-nums"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              {total}
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "color-mix(in srgb, var(--color-altus-red-deep) 75%, transparent)" }}
            >
              Total
            </span>
          </span>
        </div>
        {people.length === 0 ? (
          <p className="mt-4 text-[13.5px] font-semibold text-ink-subtle">
            You have no tasks awaiting re-work.
          </p>
        ) : (
          /* gap-1, down from gap-2.5. The rows carry `py-2.5` of their own now,
             and padding + gap compound — keeping both would have put 30px of
             air between two names and made a nine-person list scroll for no
             reason. The padding sets the rhythm; the gap only keeps the hover
             targets from touching. */
          <ul className="mt-4 flex flex-col gap-1">
            {people.map((p) => {
              const w = (p.count / maxCount) * 100;
              return (
                <li key={p.employeeId}>
                  {/* The whole row is the target, bar included — the bar is the
                      thing the eye lands on, so making only the name clickable
                      would put the affordance in the wrong place.

                      `emp`, not `doer`, and the employee ID rather than a name
                      slug: that is what parseTaskFilters already reads and what
                      the query filters on. A slug would need a reverse lookup
                      and would break on renames and duplicate names. */}
                  <Link
                    href={
                      `/tasks?emp=${encodeURIComponent(p.employeeId)}&status=not_approved&overdue=true` as Route
                    }
                    title={`Open ${p.employeeName}'s overdue sent-back tasks`}
                    className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-slate-50"
                  >
                  <Avatar name={p.employeeName} avatarUrl={avatarById[p.employeeId] ?? null} size={32} />
                  <span
                    className="w-[30%] shrink-0 truncate text-[13.5px] font-bold text-ink-strong"
                    title={p.employeeName}
                  >
                    {p.employeeName}
                  </span>
                  <span
                    className="relative h-4 flex-1 overflow-hidden rounded-full"
                    style={{ background: "color-mix(in srgb, var(--color-altus-red) 14%, transparent)" }}
                  >
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${w}%`,
                        background: `linear-gradient(90deg, color-mix(in srgb, ${RED} 75%, transparent), ${RED})`,
                      }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[14px] font-black tabular-nums" style={{ color: RED }}>
                    {p.count}
                  </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      {/* RIGHT — aging across the fine buckets.
          `h-full flex flex-col` on the card + `flex-1` on the chart wrapper is
          what lets the nine rows absorb the height the taller left panel sets,
          instead of the card ending early and leaving a white band. */}
      <GlassCard className="flex h-full flex-col lg:col-span-7">
        <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          How overdue · vs effective due date
        </p>
        <div className="mt-4 flex flex-1 flex-col">
          <FineBucketBars
            buckets={buckets ?? []}
            /* PERCENTAGES OUT OF THE SECTION'S OWN TOTAL — the 63 in the badge
               across the split, not the bucket sum.

               Without this the denominator defaults to the chart's own total,
               which is the DATED rows only: `distributePendingFine` cannot
               place a task with no due date on an early/late scale, so those
               land in `undated` and never enter a bucket. The tooltips were
               therefore quoting a share of a number shown nowhere on screen,
               and always overstating it. Out of 63, a 40-task bucket reads
               63.5%; out of the dated subset it read higher.

               Consequence, and the right one: the buckets now sum to under
               100% whenever `undated > 0`, which is exactly what the "declined
               without a due date — not placed" line below the chart accounts
               for. */
            percentBase={total}
            earlyLabel="not yet due"
            lateLabel="overdue"
            // Every task in THIS chart is sent-back work by construction — it is
            // the Not Approved section — so the drill-through and the tooltip's
            // split can both state that rather than infer it per row.
            linkStatuses={["not_approved"]}
            statusBreakdown={(count) => [
              { label: "Not Approved", value: count },
              { label: "Pending", value: 0 },
            ]}
          />
        </div>
        {undated > 0 && (
          <p className="mt-3 text-[12px] font-semibold text-ink-subtle">
            {undated} declined without a due date — not placed.
          </p>
        )}
      </GlassCard>
    </div>
  );
}
