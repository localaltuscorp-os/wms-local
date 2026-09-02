import Link from "next/link";
import { formatInr } from "@/lib/format";
import { buildDrillHref } from "@/lib/outstanding/drill-href";
import { SectionHeading } from "./section-heading";

interface Rollup {
  name: string;
  notDue: number;
  overdue: number;
  balance: number;
}

export function EmployeeEntityRollups({
  byEmployee,
  byEntity,
  sp,
}: {
  byEmployee: Rollup[];
  byEntity: Rollup[];
  sp: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="mt-7 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
      <RollupCard
        title="Employee Wise Outstanding"
        rows={byEmployee}
        nameLabel="Name"
        hrefFor={(name) => buildDrillHref(sp, { emp: name })}
      />
      <RollupCard
        title="Entity Wise Outstanding"
        rows={byEntity}
        nameLabel="Entity"
        hrefFor={(name) => buildDrillHref(sp, { entity: name })}
      />
    </div>
  );
}

function RollupCard({
  title,
  rows,
  nameLabel,
  hrefFor,
}: {
  title: string;
  rows: Rollup[];
  nameLabel: string;
  hrefFor: (name: string) => ReturnType<typeof buildDrillHref>;
}) {
  const totalNotDue = rows.reduce((s, r) => s + r.notDue, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <SectionHeading title={title} tone="slate" />

      {rows.length === 0 ? (
        <p
          className="mt-3 font-semibold"
          style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}
        >
          No outstanding entries.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>{nameLabel}</Th>
                <Th align="right">Not Due</Th>
                <Th align="right">Overdue</Th>
                <Th align="right">Balance (₹)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.name}
                  className="border-t transition-colors hover:bg-surface-soft"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <td className="py-2.5" style={{ fontSize: 14 }}>
                    <Link
                      href={hrefFor(r.name)}
                      className="font-semibold text-ink-soft hover:text-altus-red hover:underline underline-offset-2 transition-colors"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <Td align="right">{formatInr(r.notDue)}</Td>
                  <Td align="right" style={{ color: "var(--color-red-deep)" }}>
                    {formatInr(r.overdue)}
                  </Td>
                  <Td align="right" bold>
                    {formatInr(r.balance)}
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
                  {formatInr(totalNotDue)}
                </Td>
                <Td align="right" bold style={{ color: "var(--color-red-deep)" }}>
                  {formatInr(totalOverdue)}
                </Td>
                <Td align="right" bold>
                  {formatInr(totalBalance)}
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
