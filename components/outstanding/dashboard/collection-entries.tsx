"use client";
import * as React from "react";
import { ChevronRight, ChevronsRight } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { CollectionDisplayRow } from "@/lib/queries/outstanding";

const PAGE_SIZE = 25;

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

export function CollectionEntriesTable({ rows }: { rows: CollectionDisplayRow[] }) {
  const [page, setPage] = React.useState(0);

  // Paginate only when the list is long enough to warrant it.
  const paginated = rows.length > PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  React.useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const start = paginated ? page * PAGE_SIZE : 0;
  const pageRows = paginated ? rows.slice(start, start + PAGE_SIZE) : rows;
  const pages = pageWindow(page + 1, pageCount);

  return (
    <section
      className="mt-7 rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-display-lg text-ink-strong">
          Total Collection Entries —{" "}
          <span className="tabular-nums">{rows.length}</span>{" "}
          {rows.length === 1 ? "entry" : "entries"}
        </h2>
      </header>

      {rows.length === 0 ? (
        <p
          className="mt-3 font-semibold"
          style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}
        >
          No collections recorded for this range.
        </p>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th align="right">S.No</Th>
                  <Th>Client Name</Th>
                  <Th align="right">Amount (₹)</Th>
                  <Th>Payment Mode</Th>
                  <Th>Responsible</Th>
                  <Th>Comments</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-t"
                    style={{ borderColor: "var(--color-hairline)" }}
                  >
                    <Td align="right" muted>
                      {start + i + 1}
                    </Td>
                    <td
                      className="py-2.5 font-semibold text-ink-strong"
                      style={{ fontSize: 14 }}
                    >
                      {r.clientName}
                    </td>
                    <Td
                      align="right"
                      bold
                      style={{ color: "var(--color-green-deep)" }}
                    >
                      {formatInr(r.amount)}
                    </Td>
                    <Cell>{r.paymentMode ?? "—"}</Cell>
                    <Cell>{r.responsible ?? "—"}</Cell>
                    <Cell>{r.comments?.trim() ? r.comments : "—"}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginated && pageCount > 1 && (
            <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[13px] font-semibold text-ink-subtle tabular-nums">
                Showing {start + 1}–{Math.min(rows.length, start + PAGE_SIZE)} of{" "}
                {rows.length}
              </p>
              <nav
                className="flex items-center gap-1 flex-wrap"
                aria-label="Collection entries pages"
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

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 11, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>
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
      className={`py-2.5 tabular-nums ${
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
