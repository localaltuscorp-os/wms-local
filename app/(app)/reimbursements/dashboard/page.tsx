import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  LayoutDashboard,
  Receipt,
  CheckCircle2,
  Hourglass,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { SectionIcon } from "@/components/dashboard/section-icon";
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
    <Link
      href={"/reimbursements" as Route}
      aria-label={`View ${label.toLowerCase()} reimbursement requests`}
      className="group relative flex min-h-[156px] flex-col overflow-hidden rounded-section bg-surface-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 wg-rise"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 14px 30px -26px rgba(15, 23, 42, 0.46)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{ height: 5, background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))` }}
      />
      <span
        aria-hidden
        className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-xl"
        style={{
          background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
          color: `var(--color-${tone}-deep)`,
        }}
      >
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span
        className="uppercase font-black tracking-[0.11em] leading-none"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 11, color: `var(--color-${tone}-deep)` }}
      >
        {label}
      </span>
      <span
        className="mt-5 block leading-none tracking-[-0.04em] tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2.1vw, 36px)" }}
      >
        {formatInr(block.amount)}
      </span>
      <span className="mt-auto block border-t border-hairline pt-3 font-bold leading-tight" style={{ fontSize: 12, color: "var(--color-ink-subtle)" }}>
        {formatCount(block.count)} {block.count === 1 ? "request" : "requests"}
        {sub ? <> · {sub}</> : null}
      </span>
    </Link>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-section border border-hairline bg-surface-card p-5 sm:p-6 wg-rise ${className}`}
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      {children}
    </section>
  );
}

function BreakdownCard({
  title,
  description,
  tone,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  tone: Tone;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <header className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-3">
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border"
          style={{ background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`, color: `var(--color-${tone}-deep)`, borderColor: `color-mix(in srgb, var(--color-${tone}) 20%, transparent)` }}
        >
          <Icon size={18} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-0.5 text-[12px] font-medium text-ink-subtle">{description}</p>
        </div>
      </header>
      {children}
    </Panel>
  );
}

function EmptyState({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <div
      className="flex min-h-[132px] flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center"
      style={{ borderColor: `color-mix(in srgb, var(--color-${tone}) 27%, var(--color-hairline))`, background: `color-mix(in srgb, var(--color-${tone}) 4%, transparent)` }}
    >
      <span
        aria-hidden
        className="mb-3 inline-flex size-9 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, var(--color-${tone}) 13%, transparent)`, color: `var(--color-${tone}-deep)` }}
      >
        <Receipt size={17} strokeWidth={2.2} />
      </span>
      <p className="max-w-[260px] text-[13px] font-semibold leading-relaxed text-ink-subtle">{children}</p>
    </div>
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
  if (shown.length === 0) return <EmptyState>Data will appear here as reimbursement requests are processed.</EmptyState>;
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
  if (rows.length === 0) return <EmptyState tone="red">No monthly activity yet. Your reimbursement trend will appear here.</EmptyState>;
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
    <div className="flex min-h-dvh flex-1 flex-col bg-white">
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Reimbursement Dashboard</h1>
            <p className="mt-1 text-[13px] font-medium text-ink-subtle">
              {data.scopeAll ? "Company reimbursement activity and payouts." : "Your reimbursement activity and payouts."}
            </p>
          </div>
          <Link
            href={"/reimbursements" as Route}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
          >
            All requests
            <ArrowUpRight size={15} strokeWidth={2.5} />
          </Link>
        </header>

        <nav aria-label="Reimbursement dashboard sections" className="mb-8 flex gap-2 overflow-x-auto border-b border-slate-100 pb-3">
          {[
            ["Summary", "summary"],
            ["Monthly flow", "flow"],
            ["Breakdown", "breakdown"],
            ["Recent", "recent"],
          ].map(([label, id]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-8 md:gap-10">
          <section id="summary" className="scroll-mt-28">
            <DashboardSectionHeader
              icon={<SectionIcon icon={LayoutDashboard} tone="red" />}
              title="Reimbursement summary"
              subtitle="Submitted, approved, pending, and paid reimbursement value."
              inset="px-0"
            />
            <CardGrid min={220} maxCols={4} gap="1rem">
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
              sub={<span style={{ color: "var(--color-green-deep)" }}>{data.submitted.amount > 0 ? `${approvalRate}% of submitted value` : "No submitted value yet"}</span>}
            />
            <KpiCard
              label="Pending"
              block={data.pending}
              tone="amber"
              icon={Hourglass}
              sub={<span style={{ color: "var(--color-ink-soft)" }}>Awaiting review</span>}
            />
            <KpiCard
              label="Paid"
              block={data.paid}
              tone="blue"
              icon={Wallet}
              sub={<span style={{ color: "var(--color-blue-deep)" }}>{formatInr(data.monthPaid.amount)} this month</span>}
            />
            </CardGrid>
          </section>

          <section id="flow" className="scroll-mt-28">
            <DashboardSectionHeader
              icon={<SectionIcon icon={BarChart3} tone="red" />}
              title="Monthly flow"
              subtitle="Submitted and reimbursed value across the last 12 months."
              inset="px-0"
            />
            <Panel><TrendChart rows={data.trend} /></Panel>
          </section>

          <section id="breakdown" className="scroll-mt-28">
            <DashboardSectionHeader
              icon={<SectionIcon icon={CircleDollarSign} tone="red" />}
              title="Reimbursement breakdown"
              subtitle="Status, payment method, people, and expense-head distribution."
              inset="px-0"
            />
            <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
            <BreakdownCard title="Status breakdown" description="Where each reimbursement sits today" tone="amber" icon={CircleDollarSign}>
              <BarList rows={data.byStatus} toneFor={(n) => TONE_BY_STATUS[n] ?? "slate"} />
            </BreakdownCard>
            <BreakdownCard title="Payment methods" description="How approved expenses were paid" tone="blue" icon={Wallet}>
              <BarList rows={data.byPaymentMethod} toneFor={() => "blue"} />
            </BreakdownCard>
            <BreakdownCard
              title={data.scopeAll ? "People" : "Your reimbursements"}
              description={data.scopeAll ? "Who has submitted the highest value" : "Your reimbursement totals by request"}
              tone="red"
              icon={Users}
            >
              <BarList rows={data.byPerson} toneFor={() => "red"} limit={10} />
            </BreakdownCard>
            <BreakdownCard title="Expense heads" description="Accounting category split" tone="purple" icon={Tags}>
              <BarList rows={data.byExpenseHead} toneFor={() => "purple"} limit={10} />
            </BreakdownCard>
            </div>
          </section>

          <section id="recent" className="scroll-mt-28">
            <DashboardSectionHeader
              icon={<SectionIcon icon={Receipt} tone="red" />}
              title="Recent submissions"
              subtitle="The latest 12 reimbursement requests."
              inset="px-0"
            />
            <Panel>
            {data.recent.length === 0 ? (
              <EmptyState>No reimbursement requests yet. New claims will appear here as soon as they are submitted.</EmptyState>
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
                            {r.expenseHead ?? "-"}
                          </td>
                          {!data.scopeAll && (
                            <td className="py-2.5 font-semibold text-ink-subtle whitespace-nowrap" style={{ fontSize: 13 }}>
                              {r.paidThrough ?? "-"}
                            </td>
                          )}
                          <td className="py-2.5 tabular-nums font-black text-ink-strong text-right whitespace-nowrap" style={{ fontSize: 14 }}>
                            {formatInr(r.amount)}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <span
                              className="inline-flex items-center rounded-pill px-2.5 py-0.5 font-bold"
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
          </section>
        </div>
      </PageShell>
    </div>
  );
}
