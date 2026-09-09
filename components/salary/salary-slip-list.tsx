"use client";

import * as React from "react";
import { FileDown, FileText, ChevronDown, ExternalLink, Loader2 } from "lucide-react";

/** One month the employee has a salary sheet for. */
export interface SalarySlipMonth {
  /** "YYYY-MM" — the query param the PDF route takes. */
  month: string;
  /** "July 2026" — what the row reads. */
  label: string;
  /** The financial year the month belongs to, already labelled ("FY 26-27" —
   *  `fyForMonth` carries its own prefix). Groups the list. */
  fy: string;
  designation: string | null;
  companyName: string | null;
  /** Effective net for the month, already computed server-side. */
  finalPayment: number;
  paid: boolean;
}

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * SALARY SLIP — an employee's own slips, one row per month, newest first.
 *
 * Opened from the HR deck. The HR module is rail-less, so this deck card is the
 * only door; the page is hard-scoped to the signed-in employee by the server
 * component that renders it, and the PDF route re-checks independently (admin,
 * or the employee themselves — anything else is a 403). The nav is convenience;
 * neither layer trusts the other.
 *
 * ONE ROW OPENS AT A TIME. Each slip is rendered on demand by the server —
 * salary + attendance + incentives, the same pipeline as the emailed slip — so
 * letting several expand at once would fire several PDF renders for documents
 * nobody is looking at yet. Collapsing unmounts the iframe, which also stops a
 * long list from holding a dozen PDF viewers in memory.
 *
 * THE PREVIEW IS LAZY. `src` is only set once a row has been opened, so landing
 * on the page costs nothing until someone asks for a document.
 */
export function SalarySlipList({
  employeeId,
  months,
}: {
  employeeId: string;
  months: SalarySlipMonth[];
}) {
  const [open, setOpen] = React.useState<string | null>(null);

  if (months.length === 0) {
    return (
      <section className="admin-panel px-6 py-16 text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 inline-grid size-12 place-items-center rounded-2xl"
          style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT_DEEP }}
        >
          <FileText size={22} strokeWidth={2.2} />
        </span>
        <p
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-serif), system-ui, sans-serif", fontStyle: "italic", fontSize: 22 }}
        >
          No salary slips yet
        </p>
        <p className="mt-2 text-[14px] text-ink-subtle">
          A slip appears here for every month your salary has been processed.
        </p>
      </section>
    );
  }

  // Group by financial year so a long history stays scannable. The list is
  // already newest-first, so the first FY seen is the current one.
  const groups: { fy: string; rows: SalarySlipMonth[] }[] = [];
  for (const m of months) {
    const last = groups[groups.length - 1];
    if (last && last.fy === m.fy) last.rows.push(m);
    else groups.push({ fy: m.fy, rows: [m] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.fy}>
          <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            {g.fy}
            <span className="ml-2 font-bold tracking-normal normal-case text-ink-subtle">
              · {g.rows.length} {g.rows.length === 1 ? "slip" : "slips"}
            </span>
          </h2>

          <ul className="admin-panel divide-y divide-[var(--color-hairline)] overflow-hidden">
            {g.rows.map((m) => (
              <SlipRow
                key={m.month}
                employeeId={employeeId}
                slip={m}
                open={open === m.month}
                onToggle={() => setOpen(open === m.month ? null : m.month)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SlipRow({
  employeeId,
  slip,
  open,
  onToggle,
}: {
  employeeId: string;
  slip: SalarySlipMonth;
  open: boolean;
  onToggle: () => void;
}) {
  // Sticks once opened: re-collapsing and re-opening the same row should not
  // show a spinner for a document the browser has already fetched.
  const [loaded, setLoaded] = React.useState(false);

  const base = `/salary/earnings/${employeeId}?month=${slip.month}`;
  const viewHref = `${base}&view=1`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-soft"
      >
        <span
          aria-hidden
          className="inline-grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${ACCENT} 9%, transparent)`, color: ACCENT_DEEP }}
        >
          <FileText size={16} strokeWidth={2.4} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-ink-strong">{slip.label}</span>
          <span className="block truncate text-[12.5px] text-ink-subtle">
            {[slip.designation, slip.companyName].filter(Boolean).join(" · ") || "Salary slip"}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block tabular-nums text-[14px] font-black text-ink-strong">
            {inr(slip.finalPayment)}
          </span>
          <span
            className="mt-0.5 inline-block rounded-pill px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider"
            style={
              slip.paid
                ? { background: "color-mix(in srgb, #15803d 12%, transparent)", color: "#15803d" }
                : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" }
            }
          >
            {slip.paid ? "Paid" : "Pending"}
          </span>
        </span>

        <ChevronDown
          size={18}
          strokeWidth={2.4}
          aria-hidden
          className="shrink-0 text-ink-subtle transition-transform duration-200 motion-reduce:transition-none"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--color-hairline)] bg-surface-soft px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            {/* Download keeps the attachment disposition — the default the route
                has always served. */}
            <a
              href={base}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <FileDown size={15} strokeWidth={2.5} /> Download PDF
            </a>
            {/* An escape hatch for anyone whose browser will not render a PDF in
                an iframe — the preview below is a convenience, not the only way
                to read the document. */}
            <a
              href={viewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:border-[color-mix(in_srgb,var(--color-altus-red)_45%,transparent)] hover:text-altus-red"
            >
              <ExternalLink size={15} strokeWidth={2.5} /> Open in new tab
            </a>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-hairline-strong bg-surface-card">
            {!loaded && (
              <div className="absolute inset-0 grid place-items-center text-ink-subtle">
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
                  <Loader2 size={15} className="animate-spin" aria-hidden /> Preparing your slip…
                </span>
              </div>
            )}
            <iframe
              src={viewHref}
              title={`Salary slip — ${slip.label}`}
              onLoad={() => setLoaded(true)}
              className="h-[70vh] min-h-[420px] w-full"
              style={{ border: 0, opacity: loaded ? 1 : 0 }}
            />
          </div>
        </div>
      )}
    </li>
  );
}
