"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { CE_CATEGORIES } from "@/lib/client-engagement/constants";
import { formatDuration } from "@/lib/client-engagement/schedule";
import { buildEmpGrid, type EmpGridTotal } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeEngagementRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { CARD, CARD_SHADOW, DISPLAY, HhStatusPill, Segmented, Select, Toolbar } from "./ui";

/**
 * EMP GRID — each employee's workload, as the team writes it on paper:
 *
 *     PS Participants
 *     Ruchita
 *     1.   ABC Shah      (79)   180 mins   (2)
 *     2.   PQR Mehta     (72)   240 mins   (3)
 *     Total:             5      600 mins   5
 *     …
 *     G-Total
 *
 * The Total row leaves the name column empty (names do not add up) and puts the
 * number of participants in the batch column, exactly where the sketch has it.
 * Only ACTIVE accounts; an account on hold is not this week's work.
 */

type CatFilter = "ps" | "bss" | "retainer" | "corporate" | "ambassador" | "all";

const FILTERS: { value: CatFilter; label: string }[] = [
  { value: "ps", label: "PS Participants" },
  { value: "bss", label: "BSS Participants" },
  { value: "retainer", label: "Retainer" },
  { value: "corporate", label: "Corporate" },
  { value: "ambassador", label: "Ambassadors" },
  { value: "all", label: "All" },
];

const mins = (m: number) => `${m} mins`;

export function EmpGrid({
  members,
  accounts,
  engagements,
  monday,
  weekLabel,
}: {
  members: CeMemberRow[];
  accounts: CeAccountRow[];
  engagements: CeEngagementRow[];
  monday: string;
  weekLabel: string;
}) {
  const [cat, setCat] = React.useState<CatFilter>("ps");
  const [who, setWho] = React.useState("");
  const [hideEmpty, setHideEmpty] = React.useState(false);

  const categories = new Set(cat === "all" ? CE_CATEGORIES.map((c) => c.code) : [cat]);
  const grid = buildEmpGrid(members, accounts, engagements, monday, categories);
  const heading = FILTERS.find((f) => f.value === cat)!.label;
  const sections = grid.sections.filter((s) => (!who || (who === "none" ? s.memberId === null : s.memberId === who)) && (!hideEmpty || s.rows.length));
  const visibleTotal: EmpGridTotal = who
    ? sections.reduce((t, s) => ({ participants: t.participants + s.total.participants, minutes: t.minutes + s.total.minutes, engagements: t.engagements + s.total.engagements }), { participants: 0, minutes: 0, engagements: 0 })
    : grid.grandTotal;

  return (
    <>
      <Toolbar>
        <Segmented value={cat} options={FILTERS} onChange={setCat} ariaLabel="Category" />
        <Select value={who} onChange={setWho} ariaLabel="Employee" className="w-[170px] shrink-0">
          <option value="">Every employee</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="none">Unassigned</option>
        </Select>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold text-ink-soft">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="size-3.5 accent-[var(--color-altus-red)]" />
          Hide empty
        </label>
        <span className="min-w-0 flex-1 text-right text-[12.5px] font-medium text-ink-muted">Week of {weekLabel}</span>
      </Toolbar>

      <h2 className="mb-2 px-1 text-[18px] font-extrabold tracking-[-0.01em] text-ink-strong" style={DISPLAY}>
        {heading}
      </h2>

      {/* One card per person, STACKED, every table on the same column widths
          (<Cols/>) so Sr No., Batch, Weekly duration and Weekly calls line up
          from card to card and with the G-Total at the bottom (asked
          2026-09-19: the side-by-side cards looked misaligned). */}
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <section key={s.memberId ?? "unassigned"} className={`${CARD} min-w-0 overflow-hidden`} style={CARD_SHADOW}>
            <header className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
              <h3
                className="min-w-0 flex-1 truncate text-[15px] font-extrabold"
                style={{ ...DISPLAY, color: s.memberId ? "var(--color-ink-strong)" : "var(--color-red-deep)" }}
              >
                {s.memberName}
              </h3>
              <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-ink-subtle">
                {s.rows.length} {s.rows.length === 1 ? "account" : "accounts"}
              </span>
              {s.memberId ? (
                <Link
                  href={`/operations/client-engagement/calendar?member=${s.memberId}&week=${monday}`}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11.5px] font-bold text-ink-subtle hover:bg-surface-soft hover:text-altus-red-deep"
                >
                  <CalendarDays size={13} strokeWidth={2.4} /> Calendar
                </Link>
              ) : null}
            </header>
            <div className="scroll-x-only">
              <table className="w-full min-w-[560px] table-fixed border-collapse">
                <Cols />
                <thead>
                  <tr className="border-b border-hairline bg-surface-soft">
                    <th className={`${HEAD} pl-4 text-left`}>Sr No.</th>
                    <th className={`${HEAD} text-left`}>Client name</th>
                    <th className={`${HEAD} text-right`}>Batch</th>
                    <th className={`${HEAD} text-right`}>Weekly duration</th>
                    <th className={`${HEAD} pr-4 text-right`}>Weekly calls</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-[12.5px] font-medium text-ink-subtle">
                        No active {heading.toLowerCase()} with {s.memberName}.
                      </td>
                    </tr>
                  ) : (
                    s.rows.map((r) => {
                      const account = accounts.find((a) => a.id === r.accountId);
                      return (
                        <tr key={r.accountId} className="border-b border-hairline hover:bg-surface-soft">
                          <td className={`${CELL} pl-4 text-[12.5px] font-bold text-ink-subtle`}>{r.sr}.</td>
                          <td className={CELL}>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 truncate text-[13.5px] font-bold text-ink-strong" title={account?.fullName ?? r.label}>
                                {account?.fullName ?? r.label}
                              </span>
                              <span className="shrink-0">
                                <HhStatusPill status={r.hhStatus} small />
                              </span>
                            </span>
                          </td>
                          <td className={`${CELL} text-right text-[12.5px] font-semibold text-ink-muted`}>
                            {account?.batchCode ? `(${account.batchCode})` : "—"}
                          </td>
                          <td className={`${CELL} text-right text-[13px] ${r.minutes ? "text-ink-strong" : "text-ink-subtle"}`}>{mins(r.minutes)}</td>
                          <td className={`${CELL} pr-4 text-right text-[13px] text-ink-strong`}>({r.calls})</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <TotalRow label="Total:" total={s.total} />
                </tfoot>
              </table>
            </div>
          </section>
        ))}

        {/* G-Total — same columns, so its three numbers sit under the columns they add up. */}
        <div
          className="scroll-x-only rounded-2xl border"
          style={{
            borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
            background: "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card)), var(--color-surface-card) 70%)",
          }}
        >
          <table className="w-full min-w-[560px] table-fixed border-collapse">
            <Cols />
            <tbody>
              <tr>
                <td colSpan={2} className="truncate py-3 pl-4 pr-2 text-[15px] font-extrabold text-ink-strong" style={DISPLAY}>
                  G-Total{who ? "" : ` · ${heading}`}
                </td>
                <GTotalCell value={String(visibleTotal.participants)} caption="participants" />
                <GTotalCell value={mins(visibleTotal.minutes)} caption={formatDuration(visibleTotal.minutes)} />
                <GTotalCell value={String(visibleTotal.engagements)} caption="engagements" last />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const HEAD = "whitespace-nowrap px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle";
const CELL = "whitespace-nowrap px-3 py-2 tabular-nums";

/** The one set of column widths every Emp Grid table uses; the name takes the rest. */
function Cols() {
  return (
    <colgroup>
      <col style={{ width: 84 }} />
      <col />
      <col style={{ width: 130 }} />
      <col style={{ width: 170 }} />
      <col style={{ width: 150 }} />
    </colgroup>
  );
}

function TotalRow({ label, total }: { label: string; total: EmpGridTotal }) {
  return (
    <tr style={{ background: "color-mix(in srgb, var(--color-slate) 40%, transparent)" }}>
      <td className={`${CELL} pl-4 text-[12.5px] font-extrabold text-ink-strong`}>{label}</td>
      {/* Names do not add up — deliberately empty. */}
      <td className={CELL} />
      <td className={`${CELL} text-right`}>
        <span className="block text-[13.5px] font-extrabold text-ink-strong">{total.participants}</span>
        <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-subtle">participants</span>
      </td>
      <td className={`${CELL} text-right`}>
        <span className="block text-[13.5px] font-extrabold text-ink-strong">{mins(total.minutes)}</span>
        <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{formatDuration(total.minutes)}</span>
      </td>
      <td className={`${CELL} pr-4 text-right`}>
        <span className="block text-[13.5px] font-extrabold text-ink-strong">{total.engagements}</span>
        <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-subtle">engagements</span>
      </td>
    </tr>
  );
}

function GTotalCell({ value, caption, last = false }: { value: string; caption: string; last?: boolean }) {
  return (
    <td className={`${CELL} py-3 text-right ${last ? "pr-4" : ""}`}>
      <span className="block text-[18px] font-extrabold text-ink-strong" style={DISPLAY}>
        {value}
      </span>
      <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{caption}</span>
    </td>
  );
}
