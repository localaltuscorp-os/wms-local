"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr, formatCount } from "@/lib/format";
import { SectionHeading } from "./section-heading";

interface MonthRow {
  month: string; // YYYY-MM
  cases: number;
  value: number;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-01" → "Jan '26". Falls back to the raw string if unparseable. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return month;
  return `${MONTHS[mi]} '${y.slice(2)}`;
}

const TONE: Record<"red" | "green", { bar: string; deep: string }> = {
  red: { bar: "var(--color-red)", deep: "var(--color-red-deep)" },
  green: { bar: "var(--color-green)", deep: "var(--color-green-deep)" },
};

export function MonthSummaryPanel({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: MonthRow[];
  tone: "red" | "green";
}) {
  const data = rows.map((r) => ({
    ...r,
    label: monthLabel(r.month),
  }));
  const totalCases = rows.reduce((s, r) => s + r.cases, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const color = TONE[tone];

  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <SectionHeading title={title} tone={tone} />

      {data.length === 0 ? (
        <p
          className="mt-3 font-semibold"
          style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}
        >
          No entries in this range.
        </p>
      ) : (
        <>
          <div style={{ height: 220 }} className="mt-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-hairline)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  tick={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    fill: "var(--color-ink-subtle)",
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-hairline)" }}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "rgba(15,23,42,0.04)" }}
                  contentStyle={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    borderRadius: 10,
                    border: "1px solid var(--color-hairline)",
                    boxShadow: "0 4px 14px rgba(15,23,42,0.10)",
                  }}
                  labelFormatter={(l) => l}
                  formatter={(value, _name, item) => {
                    const cases =
                      (item?.payload as MonthRow | undefined)?.cases ?? 0;
                    return [
                      `${formatInr(Number(value))} · ${formatCount(cases)} cases`,
                      "Value",
                    ];
                  }}
                />
                <Bar
                  dataKey="value"
                  fill={color.bar}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={56}
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th align="right">No. of Cases</Th>
                  <Th align="right">Value (₹)</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr
                    key={r.month}
                    className="border-t"
                    style={{ borderColor: "var(--color-hairline)" }}
                  >
                    <td
                      className="py-2.5 font-semibold text-ink-soft"
                      style={{ fontSize: 14 }}
                    >
                      {r.label}
                    </td>
                    <Td align="right">{formatCount(r.cases)}</Td>
                    <Td align="right">{formatInr(r.value)}</Td>
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
                    {formatCount(totalCases)}
                  </Td>
                  <Td align="right" bold style={{ color: color.deep }}>
                    {formatInr(totalValue)}
                  </Td>
                </tr>
              </tbody>
            </table>
          </div>
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
