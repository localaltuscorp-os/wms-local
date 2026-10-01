"use client";

import * as React from "react";
import { groupOf, type CeGroup } from "@/lib/client-engagement/constants";
import { formatDuration } from "@/lib/client-engagement/schedule";
import type { Load, MemberCapacity, PcaCell, PcaColumn, PcaMatrixRow } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { AccountsTablePane } from "./accounts-table-pane";
import { CARD, CARD_SHADOW, DISPLAY, Segmented } from "./ui";

/**
 * PCA GRID — the transpose of the Emp Grid.
 *
 * TOP: the matrix — a row per team member (and Unassigned), columns
 * P | C | Total (P + C) | A, and in every cell how many they carry, the weekly
 * time committed and the number of calls. Ambassadors are never added into a
 * total (asked 2026-09-19); the board's "All" footer follows the same rule.
 *
 * BELOW (rebuilt 2026-09-29, "change this into the table view as we did in
 * Overview... make the respective functions for it"): the SAME AccountsTable
 * Overview uses — select, group-by, Columns, Active/Inactive/All, sortable
 * columns, edit and transfer — filtered to whichever P/C/A/All group the
 * Segmented control above it picks, in place of the old read-only card board.
 */

type View = CeGroup | "all";

export function PcaGrid({
  columns,
  total,
  accounts,
  members,
  loads,
  capacity,
  callCounts,
  canManage,
  myMemberId,
}: {
  columns: PcaColumn[];
  total: PcaMatrixRow;
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  loads: Record<string, Load>;
  capacity: MemberCapacity[];
  callCounts: Record<string, number>;
  canManage: boolean;
  myMemberId: string | null;
}) {
  const [view, setView] = React.useState<View>("all");
  const batches = React.useMemo(
    () => [...new Set(accounts.map((a) => a.batchCode).filter((b): b is string => Boolean(b)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [accounts],
  );
  const boardAccounts = React.useMemo(
    () => (view === "all" ? accounts : accounts.filter((a) => groupOf(a.category) === view)),
    [accounts, view],
  );

  return (
    <>
      {/* The matrix */}
      <section className={`${CARD} mb-4 scroll-x-only`} style={CARD_SHADOW}>
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft">
              <th className="py-2.5 pl-4 pr-3 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Team member</th>
              <MatrixHead label="Participants (P)" onClick={() => setView("P")} />
              <MatrixHead label="Clients (C)" onClick={() => setView("C")} />
              {/* P + C only. Ambassadors are NOT added into the total (asked
                  2026-09-19) — they stand on their own, last. */}
              <MatrixHead label="Total (P + C)" />
              <MatrixHead label="Ambassadors (A)" onClick={() => setView("A")} last />
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.memberId ?? "unassigned"} className="border-b border-hairline hover:bg-surface-soft">
                <td className="py-2 pl-4 pr-3 text-[13.5px] font-bold" style={{ color: c.memberId ? "var(--color-ink-strong)" : "var(--color-red-deep)", fontStyle: c.memberId ? undefined : "italic" }}>
                  {c.memberName}
                </td>
                <MatrixCell cell={c.cells.P} />
                <MatrixCell cell={c.cells.C} />
                <MatrixCell cell={sumCells(c.cells.P, c.cells.C)} strong tinted />
                <MatrixCell cell={c.cells.A} last />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "color-mix(in srgb, var(--color-slate) 40%, transparent)" }}>
              <td className="py-2.5 pl-4 pr-3 text-[13.5px] font-extrabold text-ink-strong">Total</td>
              <MatrixCell cell={total.P} strong />
              <MatrixCell cell={total.C} strong />
              <MatrixCell cell={sumCells(total.P, total.C)} strong />
              <MatrixCell cell={total.A} strong last />
            </tr>
          </tfoot>
        </table>
      </section>

      {/* The board — Overview's own AccountsTable, filtered to this group. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2 px-1">
        <h2 className="mr-auto text-[18px] font-extrabold tracking-[-0.01em] text-ink-strong" style={DISPLAY}>
          Who carries whom
        </h2>
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel="P, C, A or All"
          options={[
            { value: "P", label: "P" },
            { value: "C", label: "C" },
            { value: "A", label: "A" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      <AccountsTablePane
        accounts={boardAccounts}
        members={members}
        loads={loads}
        capacity={capacity}
        callCounts={callCounts}
        canManage={canManage}
        myMemberId={myMemberId}
        batches={batches}
      />
    </>
  );
}

/** Participants + Clients — the matrix's Total column. Ambassadors never join it. */
function sumCells(a: PcaCell, b: PcaCell): PcaCell {
  return { count: a.count + b.count, minutes: a.minutes + b.minutes, calls: a.calls + b.calls };
}

function MatrixHead({ label, onClick, last = false }: { label: string; onClick?: () => void; last?: boolean }) {
  return (
    <th className={`whitespace-nowrap py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle ${last ? "pl-3 pr-4" : "px-3"}`}>
      {onClick ? (
        <button type="button" onClick={onClick} className="uppercase hover:text-altus-red-deep" title="Show only these on the board below">
          {label}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function MatrixCell({ cell, strong = false, last = false, tinted = false }: { cell: PcaCell; strong?: boolean; last?: boolean; tinted?: boolean }) {
  return (
    <td
      className={`py-2 text-right ${last ? "pl-3 pr-4" : "px-3"}`}
      style={tinted ? { background: "color-mix(in srgb, var(--color-slate) 18%, transparent)" } : undefined}
    >
      <span className={`block text-[15px] tabular-nums ${strong ? "font-extrabold" : "font-bold"} ${cell.count ? "text-ink-strong" : "text-ink-subtle"}`} style={DISPLAY}>
        {cell.count}
      </span>
      <span className="block whitespace-nowrap text-[11px] font-medium tabular-nums text-ink-subtle">
        {cell.count ? `${formatDuration(cell.minutes)} · ${cell.calls} call${cell.calls === 1 ? "" : "s"}` : "—"}
      </span>
    </td>
  );
}
