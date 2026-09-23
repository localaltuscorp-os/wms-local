"use client";

import * as React from "react";
import { CE_GROUPS, type CeGroup } from "@/lib/client-engagement/constants";
import { formatDuration } from "@/lib/client-engagement/schedule";
import type { PcaCell, PcaColumn, PcaMatrixRow } from "@/lib/client-engagement/grids";
import { CARD, CARD_SHADOW, DISPLAY, HhStatusPill, Segmented } from "./ui";

/**
 * PCA GRID — the transpose of the Emp Grid.
 *
 * TOP: the matrix — a row per team member (and Unassigned), columns
 * P | C | Total (P + C) | A, and in every cell how many they carry, the weekly
 * time committed and the number of calls. Ambassadors are never added into a
 * total (asked 2026-09-19); the board's "All" footer follows the same rule.
 *
 * BELOW: the board from the sketch — P / C / A / All buttons, a column per
 * person (Unassigned last) listing the names themselves, and a Total row.
 */

type View = CeGroup | "all";

export function PcaGrid({ columns, total }: { columns: PcaColumn[]; total: PcaMatrixRow }) {
  const [view, setView] = React.useState<View>("all");
  const groups = view === "all" ? CE_GROUPS : CE_GROUPS.filter((g) => g.code === view);
  const key = view === "all" ? "all" : view;

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

      {/* The board — the sketch's "a column per person, names listed under
          each". One CARD per person in a wrapping grid (2026-09-19): a fixed
          9-column table could not fit with the sidebar open, so Unassigned —
          the column that matters most — scrolled out of sight. */}
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

      <div className="grid items-stretch gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        {columns.map((c) => {
          // "All" totals P + C only — ambassadors are never added into a total (asked 2026-09-19).
          const cell = view === "all" ? sumCells(c.cells.P, c.cells.C) : c.cells[key];
          const unassigned = c.memberId === null;
          return (
            <section
              key={c.memberId ?? "unassigned"}
              className={`${CARD} flex min-w-0 flex-col overflow-hidden`}
              style={{
                ...CARD_SHADOW,
                ...(unassigned ? { borderColor: "color-mix(in srgb, var(--color-red-deep) 35%, transparent)", borderStyle: "dashed" } : {}),
              }}
            >
              <header className="border-b border-hairline px-3 py-2">
                <h3 className="truncate text-[14px] font-extrabold" style={{ ...DISPLAY, color: unassigned ? "var(--color-red-deep)" : "var(--color-ink-strong)" }}>
                  {c.memberName}
                </h3>
              </header>
              <div className="flex-1 px-3 py-2">
                {groups.map((g) => {
                  const entries = c.entries.filter((e) => e.group === g.code);
                  return (
                    <div key={g.code} className="mb-2 last:mb-0">
                      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.1em] text-ink-subtle">
                        {g.plural} <span className="tabular-nums">({entries.length})</span>
                      </div>
                      {entries.length ? (
                        <ol className="grid gap-1">
                          {entries.map((e, i) => (
                            <li key={e.accountId} className="flex min-w-0 items-start gap-1.5 text-[12.5px] leading-snug">
                              <span className="w-4 shrink-0 text-right text-[11px] font-bold tabular-nums text-ink-subtle">{i + 1}.</span>
                              <span className="min-w-0 break-words font-semibold text-ink-strong">
                                {e.label}
                                {e.hhStatus !== "standard" ? (
                                  <span className="ml-1 inline-block align-middle">
                                    <HhStatusPill status={e.hhStatus} small />
                                  </span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <span className="text-[12px] text-ink-subtle">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <footer className="border-t border-hairline px-3 py-2" style={{ background: "color-mix(in srgb, var(--color-slate) 40%, transparent)" }}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-ink-subtle">{view === "all" ? "Total (P + C)" : "Total"}</span>
                  <span className="ml-auto text-[17px] font-extrabold leading-none tabular-nums text-ink-strong" style={DISPLAY}>
                    {cell.count}
                  </span>
                </div>
                <div className="mt-0.5 text-right text-[11px] font-semibold tabular-nums text-ink-muted">
                  {formatDuration(cell.minutes)} · {cell.calls} call{cell.calls === 1 ? "" : "s"} a week
                </div>
              </footer>
            </section>
          );
        })}
      </div>
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
