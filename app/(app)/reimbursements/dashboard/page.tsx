import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  Receipt,
  CheckCircle2,
  Hourglass,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireUser } from "@/lib/auth/current";
import { formatInr, formatCount, formatDate } from "@/lib/format";
import {
  getReimbursementDashboard,
  type KpiBlock,
  type NamedAmount,
  type MonthPoint,
} from "@/lib/queries/reimbursement-dashboard";

export const dynamic = "force-dynamic";

type Tone = "slate" | "red" | "green" | "blue" | "amber" | "purple";

/* ───────────────────────────── atoms ───────────────────────────── */

function KpiCard({
  label,
  block,
  tone,
  icon: Icon,
  sub,
}: {
  label: string;
  block: KpiBlock;
  tone: Tone;
  icon: LucideIcon;
  sub?: React.ReactNode;
}) {
  return (
    <div
      className="relative block bg-surface-card rounded-section overflow-hidden wg-rise"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        padding: "16px 18px 15px",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{ height: 5, background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))` }}
      />
      <span
        aria-hidden
        className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-xl"
        style={{
          background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
          color: `var(--color-${tone}-deep)`,
        }}
      >
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 12, color: `var(--color-${tone}-deep)` }}
      >
        {label}
      </span>
      <span
        className="block mt-2 leading-[0.9] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px, 1.9vw, 34px)" }}
      >
        {formatInr(block.amount)}
      </span>
      <span className="block mt-2 font-bold leading-tight" style={{ fontSize: 12, color: "var(--color-ink-subtle)" }}>
        {formatCount(block.count)} {block.count === 1 ? "request" : "requests"}
        {sub ? <> · {sub}</> : null}
      </span>
    </div>
  );
}

function Panel({
  title,
  description,
  tone = "slate",
  children,
}: {
  title: string;
  description?: string;
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-5 wg-rise"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <header className="flex items-start gap-3 mb-5">
        <span
          aria-hidden
          className="mt-1 h-7 w-[3px] shrink-0 rounded-full"
          style={{ background: `linear-gradient(180deg, var(--color-${tone}), var(--color-${tone}-deep))` }}
        />
        <div className="min-w-0">
          <h2 className="text-display-lg text-ink-strong">{title}</h2>
          {description && <p className="text-body-lg text-ink-subtle mt-0.5">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
      {children}
    </p>
  );
}

const TONE_BY_STATUS: Record<string, Tone> = {
  Approved: "green",
  Pending: "amber",
  Rejected: "red",
};

/** Horizontal bar list (₹ + share), descending. */
function BarList({
  rows,
  toneFor,
  limit = 8,
}: {
  rows: NamedAmount[];
  toneFor?: (name: string) => Tone;
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  const max = shown.reduce((m, r) => Math.max(m, r.amount), 0);
  if (shown.length === 0) return <EmptyLine>Nothing here yet.</EmptyLine>;
  return (
    <ol className="space-y-3">
      {shown.map((r) => {
        const tone = toneFor?.(r.name) ?? "red";
        const pct = max > 0 ? (r.amount / max) * 100 : 0;
        return (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-bold text-ink-strong" style={{ fontSize: 14 }}>
                {r.name}
              </span>
              <span className="tabular-nums font-bold text-ink-strong shrink-0" style={{ fontSize: 14 }}>
                {formatInr(r.amount)}
                <span className="font-semibold text-ink-subtle" style={{ fontSize: 12 }}>
                  {" "}
                  · {formatCount(r.count)}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Month-over-month vertical bar chart (paid + submitted), pure divs. */
function TrendChart({ rows }: { rows: MonthPoint[] }) {
  if (rows.length === 0) return <EmptyLine>No monthly activity yet.</EmptyLine>;
  const max = rows.reduce((m, r) => Math.max(m, r.paid, r.submitted), 0) || 1;
  return (
    <div>
      <div className="flex items-end gap-2 max-sm:gap-1" style={{ height: 180 }}>
        {rows.map((r) => (
          <div key={r.key} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
            <div className="flex items-end gap-[3px] w-full justify-center" style={{ height: "100%" }}>
              <span
                title={`Submitted ${formatInr(r.submitted)}`}
                className="rounded-t-[3px]"
                style={{
                  width: "42%",
                  maxWidth: 18,
                  height: `${Math.max(r.submitted > 0 ? 3 : 0, (r.submitted / max) * 100)}%`,
                  background: "color-mix(in srgb, var(--color-slate) 45%, transparent)",
                }}
              />
              <span
                title={`Reimbursed ${formatInr(r.paid)}`}
                className="rounded-t-[3px]"
                style={{
                  width: "42%",
                  maxWidth: 18,
                  height: `${Math.max(r.paid > 0 ? 3 : 0, (r.paid / max) * 100)}%`,
                  background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))",
                }}
              />
            </div>
            <span
              className="font-bold text-ink-subtle whitespace-nowrap"
              style={{ fontSize: 10, transform: "rotate(-30deg)", transformOrigin: "center" }}
            >
              {r.label.replace(" ", " ’").slice(0, 6)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4 flex-wrap" style={{ fontSize: 12 }}>
        <span className="inline-flex items-center gap-1.5 font-bold text-ink-soft">
          <span className="inline-block size-3 rounded-[3px]" style={{ background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />
          Reimbursed
        </span>
        <span className="inline-flex items-center gap-1.5 font-bold text-ink-soft">
          <span className="inline-block size-3 rounded-[3px]" style={{ background: "color-mix(in srgb, var(--color-slate) 45%, transparent)" }} />
          Submitted
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────────── page ───────────────────────────── */

export default async function Page() {
  const me = await requireUser();
  const data = await getReimbursementDashboard({ employeeId: me.id, isAdmin: me.isAdmin });

  const approvalRate =
    data.submitted.amount > 0 ? Math.round((data.approved.amount / data.submitted.amount) * 100) : 0;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1100px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <Link
              href={"/reimbursements" as Route}
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-subtle transition-colors hover:text-[color:var(--color-altus-red)] mb-1.5"
            >
              <ArrowLeft size={14} strokeWidth={2.6} />
              Reimbursements
            </Link>
            <h1 className="text-display-lg text-ink-strong">Reimbursement Dashboard</h1>
            <p className="text-body-lg text-ink-subtle mt-1">
              {data.scopeAll
                ? "Org-wide expense reimbursements — submitted, approved, paid."
                : "Your reimbursement requests at a glance."}
            </p>
          </div>
        </header>

        <div className="space-y-7">
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            <KpiCard
              label="Submitted"
              block={data.submitted}
              tone="slate"
              icon={Receipt}
              sub={<span style={{ color: "var(--color-altus-red-deep)" }}>{formatInr(data.monthSubmitted.amount)} this month</span>}
            />
            <KpiCard
              label="Approved"
              block={data.approved}
              tone="green"
              icon={CheckCircle2}
              sub={<span style={{ color: "var(--color-green-deep)" }}>{approvalRate}% of ₹ submitted</span>}
            />
            <KpiCard
              label="Pending"
              block={data.pending}
              tone="amber"
              icon={Hourglass}
              sub={<span style={{ color: "var(--color-ink-soft)" }}>awaiting review</span>}
            />
            <KpiCard
              label="Paid"
              block={data.paid}
              tone="blue"
              icon={Wallet}
              sub={<span style={{ color: "var(--color-blue-deep)" }}>{formatInr(data.monthPaid.amount)} this month</span>}
            />
          </div>

          {/* Trend */}
          <Panel title="Month-over-Month" description="Reimbursed (paid) vs submitted ₹ per month — last 12 months" tone="red">
            <TrendChart rows={data.trend} />
          </Panel>

          {/* By status + by payment method */}
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <Panel title="By Status" description="Where the money sits" tone="amber">
              <BarList rows={data.byStatus} toneFor={(n) => TONE_BY_STATUS[n] ?? "slate"} />
            </Panel>
            <Panel title="By Payment Method" description="How approved expenses were paid" tone="blue">
              <BarList rows={data.byPaymentMethod} toneFor={() => "blue"} />
            </Panel>
          </div>

          {/* By person + by expense head */}
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <Panel
              title="By Person"
              description={data.scopeAll ? "Who has reimbursed the most" : "Your totals"}
              tone="red"
            >
              <BarList rows={data.byPerson} toneFor={() => "red"} limit={10} />
            </Panel>
            <Panel title="By Expense Head" description="Accounting category split" tone="purple">
              <BarList rows={data.byExpenseHead} toneFor={() => "purple"} limit={10} />
            </Panel>
          </div>

          {/* Recent */}
          <Panel title="Recent Submissions" description="Latest 12 requests" tone="slate">
            {data.recent.length === 0 ? (
              <EmptyLine>No reimbursement requests yet.</EmptyLine>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {(data.scopeAll ? ["Person", "Expense", "Date", "Head", "Amount", "Status"] : ["Expense", "Date", "Head", "Method", "Amount", "Status"]).map(
                        (h, i) => (
                          <th
                            key={h}
                            className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
                            style={{ fontSize: 11, textAlign: i >= 4 ? "right" : "left" }}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => {
                      const statusLabel = r.approved
                        ? "Approved"
                        : r.status === "rejected"
                          ? "Rejected"
                          : "Pending";
                      const statusTone = TONE_BY_STATUS[statusLabel] ?? "slate";
                      return (
                        <tr key={r.id} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                          {data.scopeAll && (
                            <td className="py-2.5 font-bold text-ink-strong whitespace-nowrap" style={{ fontSize: 14 }}>
                              {r.employeeName}
                            </td>
                          )}
                          <td className="py-2.5 font-semibold text-ink-soft max-w-[220px] truncate" style={{ fontSize: 14 }} title={r.expenseFor}>
                            {r.expenseFor}
                          </td>
                          <td className="py-2.5 font-semibold text-ink-subtle whitespace-nowrap tabular-nums" style={{ fontSize: 13 }}>
                            {formatDate(r.createdAt)}
                          </td>
                          <td className="py-2.5 font-semibold text-ink-subtle whitespace-nowrap" style={{ fontSize: 13 }}>
                            {r.expenseHead ?? "—"}
                          </td>
                          {!data.scopeAll && (
                            <td className="py-2.5 font-semibold text-ink-subtle whitespace-nowrap" style={{ fontSize: 13 }}>
                              {r.paidThrough ?? "—"}
                            </td>
                          )}
                          <td className="py-2.5 tabular-nums font-black text-ink-strong text-right whitespace-nowrap" style={{ fontSize: 14 }}>
                            {formatInr(r.amount)}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 font-bold"
                              style={{
                                fontSize: 11,
                                background: `color-mix(in srgb, var(--color-${statusTone}) 14%, transparent)`,
                                color: `var(--color-${statusTone}-deep)`,
                              }}
                            >
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
