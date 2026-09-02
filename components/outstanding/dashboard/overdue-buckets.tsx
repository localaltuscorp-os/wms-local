import Link from "next/link";
import { formatInr, formatCount } from "@/lib/format";
import { Donut } from "@/components/charts/donut";
import { buildDrillHref } from "@/lib/outstanding/drill-href";
import { SectionHeading } from "./section-heading";

interface Bucket {
  id: string;
  label: string;
  count: number;
  amount: number;
}

/**
 * Green→red severity ramp, oldest-overdue (60+) is reddest. Concrete hex so
 * the donut slices read as a deliberate gradient (the tone CSS vars don't
 * include a lime mid-step, so we hand-pick a 7-step ramp here).
 */
const BUCKET_RAMP: Record<string, string> = {
  "0-3": "#22c55e", // green
  "4-7": "#84cc16", // lime
  "8-15": "#eab308", // yellow
  "16-30": "#f59e0b", // amber
  "31-45": "#f97316", // orange
  "46-60": "#ef4444", // red
  "60+": "#A80400", // red-deep
};

export function OverdueBucketsPanel({
  buckets,
  sp,
}: {
  buckets: Bucket[];
  sp: Record<string, string | string[] | undefined>;
}) {
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const totalAmount = buckets.reduce((s, b) => s + b.amount, 0);
  const overdueHref = buildDrillHref(sp, { status: "overdue", pdc: null });

  const slices = buckets
    .filter((b) => b.amount > 0)
    .map((b) => ({
      label: b.label,
      value: b.amount,
      color: BUCKET_RAMP[b.id] ?? "var(--color-stone)",
    }));

  return (
    <section
      className="mt-7 rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <SectionHeading
        title="Overdue by Days"
        description="Overdue balance bucketed by how long it has been past due"
        tone="red"
      />

      <div className="mt-6 grid grid-cols-[1fr_auto] gap-8 max-lg:grid-cols-1">
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                <Th>Category</Th>
                <Th align="right">Count</Th>
                <Th align="right">Amount (₹)</Th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr
                  key={b.id}
                  className="border-t transition-colors hover:bg-surface-soft"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <td className="py-2.5">
                    <Link
                      href={overdueHref}
                      className="group inline-flex items-center gap-2"
                    >
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: BUCKET_RAMP[b.id] ?? "var(--color-stone)" }}
                      />
                      <span
                        className="font-semibold text-ink-soft group-hover:text-altus-red group-hover:underline underline-offset-2 transition-colors"
                        style={{ fontSize: 14 }}
                      >
                        {b.label}
                      </span>
                    </Link>
                  </td>
                  <Td align="right">{formatCount(b.count)}</Td>
                  <Td align="right">{formatInr(b.amount)}</Td>
                </tr>
              ))}
              <tr
                className="border-t-2"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                <td className="py-2.5">
                  <span
                    className="font-black uppercase tracking-[0.04em] text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    Total Overdue
                  </span>
                </td>
                <Td align="right" bold>
                  {formatCount(totalCount)}
                </Td>
                <Td align="right" bold>
                  {formatInr(totalAmount)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Donut */}
        <div className="flex items-center justify-center max-lg:mt-2">
          {slices.length > 0 ? (
            <Donut
              data={slices}
              size={220}
              centerLabel="Overdue"
              centerValue={formatInr(totalAmount)}
            />
          ) : (
            <p
              className="font-semibold text-center"
              style={{ fontSize: 14, color: "var(--color-ink-subtle)", maxWidth: 200 }}
            >
              Nothing overdue right now.
            </p>
          )}
        </div>
      </div>
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
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
}) {
  return (
    <td
      className={`py-2.5 tabular-nums ${bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"}`}
      style={{ fontSize: 14, textAlign: align }}
    >
      {children}
    </td>
  );
}
