"use client";

import { Fragment, type ReactNode } from "react";
import { formatDate, formatTimeInTz, localDateString } from "@/lib/format";
import { ReorderableTh, useColumnOrder } from "@/components/ui/reorderable-columns";

/**
 * The salary-policy acknowledgement roster, split out of the (server) policy
 * page into its own client component ONLY so its columns can be dragged into a
 * per-user order. It stays read-only and purely presentational — the page still
 * runs the query and passes plain serializable rows.
 */
export interface ConsentStatusRow {
  employeeId: string;
  name: string;
  consented: boolean;
  signedAt: Date | null;
}

const fmtDate = (d: Date) =>
  `${formatDate(localDateString("Asia/Kolkata", d))} · ${formatTimeInTz(d, "Asia/Kolkata")}`;

/** Declared once so the header and every row read from the SAME ordered list. */
type ConsentCol = {
  id: string;
  label: string;
  thClass: string;
  cell: (r: ConsentStatusRow) => ReactNode;
};

const CONSENT_COLUMNS: ConsentCol[] = [
  {
    id: "employee",
    label: "Employee",
    thClass: "px-6 py-3.5",
    cell: (r) => <td className="px-6 py-3 text-ink-strong font-medium">{r.name}</td>,
  },
  {
    id: "consented",
    label: "Consented",
    thClass: "px-6 py-3.5 text-center",
    cell: (r) => (
      <td className="px-6 py-3 text-center">
        {r.consented ? (
          <span className="font-bold" style={{ color: "var(--color-altus-red)" }}>
            ✓
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </td>
    ),
  },
  {
    id: "signedAt",
    label: "Signed at",
    thClass: "px-6 py-3.5 text-right",
    cell: (r) => (
      <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
        {r.signedAt ? fmtDate(r.signedAt) : "—"}
      </td>
    ),
  },
];

const CONSENT_COLUMN_IDS = CONSENT_COLUMNS.map((c) => c.id);

export function PolicyConsentTable({ rows }: { rows: ConsentStatusRow[] }) {
  // Drag-to-reorder, remembered for THIS user across sessions and devices.
  const cols = useColumnOrder({
    tableKey: "accounts.salary.policy-consent",
    columns: CONSENT_COLUMN_IDS,
  });
  const orderedColumns = cols.ordered(CONSENT_COLUMNS, (c) => c.id);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr
            className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
            style={{ background: "var(--color-surface-soft)" }}
          >
            {orderedColumns.map((c) => (
              <ReorderableTh key={c.id} id={c.id} ctl={cols} className={c.thClass}>
                {c.label}
              </ReorderableTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.employeeId}
              className="border-b border-hairline last:border-b-0"
              style={{
                background: i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
              }}
            >
              {orderedColumns.map((c) => (
                <Fragment key={c.id}>{c.cell(r)}</Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
