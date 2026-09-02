import Link from "next/link";
import { formatInr, formatCount } from "@/lib/format";
import { buildDrillHref } from "@/lib/outstanding/drill-href";
import { SectionHeading } from "./section-heading";

interface PdcRow {
  name: string;
  entries: number;
  amount: number;
}

interface Pdc {
  rows: PdcRow[];
  totalEntries: number;
  totalAmount: number;
}

export function PdcPanel({
  pdc,
  sp,
}: {
  pdc: Pdc;
  sp: Record<string, string | string[] | undefined>;
}) {
  return (
    <section
      className="mt-7 rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <SectionHeading
        title="PDC Not Received"
        tone="amber"
        right={
          <span
            className="tabular-nums font-bold"
            style={{ fontSize: 14, color: "var(--color-ink-soft)" }}
          >
            {formatCount(pdc.totalEntries)} entries ·{" "}
            <span style={{ color: "var(--color-red-deep)" }}>
              {formatInr(pdc.totalAmount)}
            </span>
          </span>
        }
      />

      {pdc.rows.length === 0 ? (
        <p
          className="mt-3 font-semibold"
          style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}
        >
          All open entries have their PDC on file.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Employee (Responsible)</Th>
                <Th align="right">Entries</Th>
                <Th align="right">Amount (₹)</Th>
              </tr>
            </thead>
            <tbody>
              {pdc.rows.map((r) => (
                <tr
                  key={r.name}
                  className="border-t transition-colors hover:bg-surface-soft"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <td className="py-2.5" style={{ fontSize: 14 }}>
                    <Link
                      href={buildDrillHref(sp, { pdc: "1", emp: r.name })}
                      className="font-semibold text-ink-soft hover:text-altus-red hover:underline underline-offset-2 transition-colors"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <Td align="right">{formatCount(r.entries)}</Td>
                  <Td align="right" style={{ color: "var(--color-red-deep)" }}>
                    {formatInr(r.amount)}
                  </Td>
                </tr>
              ))}
              <tr
                className="border-t-2"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                <td
                  className="py-2.5 font-black uppercase tracking-[0.04em] text-ink-strong"
                  style={{ fontSize: 13 }}
                >
                  Total
                </td>
                <Td align="right" bold>
                  {formatCount(pdc.totalEntries)}
                </Td>
                <Td align="right" bold style={{ color: "var(--color-red-deep)" }}>
                  {formatInr(pdc.totalAmount)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
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
      className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle"
      style={{ fontSize: 11, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`py-2.5 tabular-nums ${bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"}`}
      style={{ fontSize: 14, textAlign: align, ...style }}
    >
      {children}
    </td>
  );
}
