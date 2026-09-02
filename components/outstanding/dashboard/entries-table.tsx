"use client";
import * as React from "react";
import { format } from "date-fns";
import { Search, X, ChevronRight, ChevronsRight } from "lucide-react";
import { formatInr } from "@/lib/format";
import { OUTSTANDING_CYCLE_LABELS } from "@/db/enums";
import type { OutstandingCycle } from "@/db/enums";
import type { DerivedInstallment } from "@/lib/outstanding/types";
import { SectionHeading } from "./section-heading";

const PAGE_SIZE = 20;

// date-fns `format()` throws on an invalid date; guard so one bad row degrades
// to "—" instead of crashing the whole table.
function fmtDue(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd-MMM-yyyy · EEE");
}

function cycleLabel(cycle: string | undefined): string {
  if (!cycle) return "—";
  return OUTSTANDING_CYCLE_LABELS[cycle as OutstandingCycle] ?? cycle;
}

// Window of numbered pages: 1 … window … N, mirroring the task list pager.
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  const WINDOW = 10;
  if (total <= WINDOW + 2) return Array.from({ length: total }, (_, i) => i + 1);
  let end = Math.min(total - 1, Math.max(current + 4, WINDOW + 1));
  const start = Math.max(2, end - WINDOW + 1);
  end = Math.min(total - 1, start + WINDOW - 1);
  const pages: (number | "ellipsis")[] = [1];
  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function OutstandingEntriesTable({
  entries,
}: {
  entries: DerivedInstallment[];
}) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [
        e.clientName,
        e.productName ?? "",
        e.entityName ?? "",
        e.responsibleName ?? "",
      ].some((s) => s.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  // A new search resets to the first page.
  React.useEffect(() => {
    setPage(0);
  }, [query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp the page when the filtered set shrinks.
  React.useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const start = page * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const pages = pageWindow(page + 1, pageCount);

  return (
    <section
      id="entries"
      className="mt-7 rounded-section bg-surface-card border border-hairline p-7 max-md:p-5 scroll-mt-[160px] max-md:scroll-mt-[120px]"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <SectionHeading
        title="All Outstanding Entries"
        tone="slate"
        right={
          <span
            className="tabular-nums font-bold"
            style={{ fontSize: 14, color: "var(--color-ink-soft)" }}
          >
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </span>
        }
      />

      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <div className="relative w-full max-w-md">
          <Search
            size={16}
            strokeWidth={2.2}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by client, product, entity, responsible…"
            aria-label="Search outstanding entries"
            className="w-full h-11 pl-10 pr-9 rounded-pill border border-hairline bg-surface-card text-[15px] text-ink-strong placeholder:text-ink-subtle outline-none transition-all focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-strong transition-colors"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>
        {query.trim() && (
          <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
            {filtered.length} {filtered.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p
          className="mt-5 font-semibold"
          style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}
        >
          {entries.length === 0
            ? "No outstanding entries."
            : "No entries match your search."}
        </p>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto -mx-1">
            <table className="w-full border-collapse">
              <colgroup>
                <col style={{ width: "3.5rem" }} />
                <col />
                <col />
                <col />
                <col />
                <col style={{ width: "9rem" }} />
                <col style={{ width: "7rem" }} />
                <col />
                <col />
                <col style={{ width: "7.5rem" }} />
              </colgroup>
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                >
                  <Th align="right">S.No</Th>
                  <Th>Client Name</Th>
                  <Th>Product</Th>
                  <Th>Cycle</Th>
                  <Th>Due Date</Th>
                  <Th align="right">Balance (₹)</Th>
                  <Th align="right">Days Overdue</Th>
                  <Th>Entity</Th>
                  <Th>Responsible</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e, i) => {
                  const overdue = e.state === "overdue";
                  return (
                    <tr
                      key={e.id}
                      className="border-t transition-colors hover:bg-surface-soft"
                      style={{ borderColor: "var(--color-hairline)" }}
                    >
                      <Td align="right" muted>
                        {start + i + 1}
                      </Td>
                      <td
                        className="px-3 py-2.5 font-semibold text-ink-strong"
                        style={{ fontSize: 14 }}
                      >
                        {e.clientName}
                      </td>
                      <Cell>{e.productName ?? "—"}</Cell>
                      <Cell>{cycleLabel(e.cycle)}</Cell>
                      <Cell nowrap>{fmtDue(e.dueDate)}</Cell>
                      <Td
                        align="right"
                        bold
                        style={
                          overdue ? { color: "var(--color-red-deep)" } : undefined
                        }
                      >
                        {formatInr(e.balance)}
                      </Td>
                      <Td
                        align="right"
                        style={
                          overdue ? { color: "var(--color-red-deep)" } : undefined
                        }
                      >
                        {overdue ? `${e.daysOverdue}d` : "—"}
                      </Td>
                      <Cell>{e.entityName ?? "—"}</Cell>
                      <Cell>{e.responsibleName ?? "—"}</Cell>
                      <td className="px-3 py-2.5">
                        <StatePill state={e.state} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[13px] font-semibold text-ink-subtle tabular-nums">
                Showing {start + 1}–{Math.min(filtered.length, start + PAGE_SIZE)} of{" "}
                {filtered.length}
              </p>
              <nav
                className="flex items-center gap-1 flex-wrap"
                aria-label="Outstanding entries pages"
              >
                {pages.map((p, i) =>
                  p === "ellipsis" ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-1 text-ink-subtle font-bold select-none"
                      aria-hidden
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p - 1)}
                      aria-current={p - 1 === page ? "page" : undefined}
                      className={`inline-flex items-center justify-center min-w-9 h-9 px-2.5 rounded-lg text-[13.5px] font-bold tabular-nums border transition-all ${
                        p - 1 === page
                          ? "bg-altus-red text-white border-altus-red"
                          : "bg-surface-card text-ink-strong border-hairline hover:border-altus-red hover:text-altus-red"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  aria-label="Next page"
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13.5px] font-bold border border-hairline bg-surface-card text-ink-strong transition-all enabled:hover:border-altus-red enabled:hover:text-altus-red disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={15} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(pageCount - 1)}
                  disabled={page >= pageCount - 1}
                  aria-label="Last page"
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13.5px] font-bold border border-hairline bg-surface-card text-ink-strong transition-all enabled:hover:border-altus-red enabled:hover:text-altus-red disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Last
                  <ChevronsRight size={15} strokeWidth={2.4} />
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Pill colours per derived installment state. Overdue=red, due_soon=amber,
// paid=slate, everything else (not_due) reads as green.
const PILL: Record<string, { label: string; bg: string; fg: string }> = {
  overdue: { label: "Overdue", bg: "var(--color-red-bg)", fg: "var(--color-red-deep)" },
  due_soon: { label: "Due Soon", bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)" },
  paid: { label: "Paid", bg: "var(--color-surface-track)", fg: "var(--color-ink-soft)" },
  not_due: { label: "Not Due", bg: "var(--color-green-bg)", fg: "var(--color-green-deep)" },
};

function StatePill({ state }: { state: string }) {
  const p = PILL[state] ?? PILL.not_due!;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 font-bold tracking-[0.02em] whitespace-nowrap"
      style={{ fontSize: 12, background: p.bg, color: p.fg }}
    >
      {p.label}
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="px-3 pb-2.5 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 11, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  nowrap = false,
}: {
  children: React.ReactNode;
  nowrap?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2.5 font-semibold text-ink-soft ${nowrap ? "whitespace-nowrap" : ""}`}
      style={{ fontSize: 14 }}
    >
      {children}
    </td>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
  muted = false,
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
  muted?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`px-3 py-2.5 tabular-nums whitespace-nowrap ${
        bold
          ? "font-black text-ink-strong"
          : muted
            ? "font-semibold text-ink-subtle"
            : "font-semibold text-ink-soft"
      }`}
      style={{ fontSize: 14, textAlign: align, ...style }}
    >
      {children}
    </td>
  );
}
