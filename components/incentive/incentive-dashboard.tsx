import * as React from "react";
import {
  BadgeIndianRupee,
  FolderKanban,
  Trophy,
  Users,
  BarChart3,
  PieChart,
  Tags,
} from "lucide-react";
import { formatInr } from "@/lib/format";
import type { IncentiveDashboard as DashboardData } from "@/lib/queries/incentives";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { IncentiveMonthlyChart } from "./incentive-monthly-chart";
import { IncentiveNameChart } from "./incentive-name-chart";
import { IncentiveDashboardDrilldown } from "./incentive-dashboard-drilldown";
import { IncEmployeeTable } from "./inc-employee-table";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const RED = "#E10600";
const RED_DEEP = "#A80400";

/* ─────────────────────────── small UI atoms ─────────────────────────── */

function Panel({
  title,
  description,
  icon,
  accent = RED,
  delay = 0,
  actions,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  accent?: string;
  delay?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: `${delay}ms`,
      }}
    >
      <header className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="inline-grid size-9 shrink-0 place-items-center rounded-xl"
            style={{
              background: `color-mix(in srgb, ${accent} 10%, transparent)`,
              color: accent,
            }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 21,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {title}
            </h2>
            {description && (
              <p className="text-[13px] font-medium text-ink-subtle">{description}</p>
            )}
          </div>
        </div>
        {actions}
      </header>
      {children}
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
      className={`py-2.5 tabular-nums whitespace-nowrap ${
        bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"
      }`}
      style={{ fontSize: 14, textAlign: align, ...style }}
    >
      {children}
    </td>
  );
}

/* ─────────────────────── ledger split cards ─────────────────────── */

function SplitCard({
  label,
  caption,
  approved,
  paid,
  unpaid,
  accent,
  icon: Icon,
  delay,
}: {
  label: string;
  caption: string;
  approved: number;
  paid: number;
  unpaid: number;
  accent: string;
  icon: typeof BadgeIndianRupee;
  delay: number;
}) {
  const paidPct = approved > 0 ? (paid / approved) * 100 : 0;
  return (
    <div
      className="wg-rise wg-btn relative overflow-hidden rounded-[22px] bg-surface-card px-5 py-4.5 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(110% 170% at 100% 0%, color-mix(in srgb, ${accent} 7%, transparent), transparent 55%)`,
        }}
      />
      <div className="relative flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
        >
          <Icon size={16} strokeWidth={2.4} />
        </span>
        <div>
          <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            {label}
          </span>
          <span className="block text-[11.5px] font-medium text-ink-subtle">{caption}</span>
        </div>
      </div>
      <div
        className="relative mt-2.5 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(24px, 1.9vw, 32px)",
          letterSpacing: "-0.025em",
          lineHeight: 1,
        }}
      >
        {formatInr(approved)}
      </div>
      <div
        className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--color-hairline)" }}
        aria-hidden
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(approved > 0 ? 2 : 0, Math.min(100, paidPct))}%`,
            background: `linear-gradient(90deg, #22c55e, ${GREEN_DEEP})`,
          }}
        />
      </div>
      <div className="relative mt-2 flex items-center justify-between gap-3 text-[12px] font-bold">
        <span style={{ color: GREEN_DEEP }}>{formatInr(paid)} paid</span>
        <span style={{ color: unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>
          {formatInr(unpaid)} unpaid
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────── main view ─────────────────────────── */

export function IncentiveDashboard({ data, year }: { data: DashboardData; year: number }) {
  const { permanent, project, perEmployee, perIncentiveName, monthly, leaderboard } = data;

  // NOTE: per-employee × per-month figures are not exposed by getIncentiveDashboard
  // (it returns a company-wide `monthly` series + per-employee YTD totals). We render
  // the exact per-employee Permanent / Project / YTD / Paid / Unpaid columns and keep
  // the month breakdown in the company-wide Monthly chart above, rather than inventing
  // per-person monthly splits the summary can't support.

  const empTotal = perEmployee.reduce((s, r) => s + r.total, 0);
  const empPaid = perEmployee.reduce((s, r) => s + r.paid, 0);
  const empUnpaid = perEmployee.reduce((s, r) => s + r.unpaid, 0);

  const nameApproved = perIncentiveName.reduce((s, r) => s + r.approved, 0);
  const namePaid = perIncentiveName.reduce((s, r) => s + r.paid, 0);
  const nameUnpaid = perIncentiveName.reduce((s, r) => s + r.unpaid, 0);
  // Project roll-up row (project ledger isn't split by name in the summary).
  const projectRow = project.approved > 0 || project.paid > 0;

  const leaderTotal = leaderboard.reduce((s, r) => s + r.total, 0);
  const podium = leaderboard.slice(0, 3);

  return (
    <IncentiveDashboardDrilldown year={year}>
    <div className="space-y-5">
      {/* Ledger split: permanent vs project */}
      <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
        <SplitCard
          label="Permanent"
          caption="ledger incentives · YTD"
          approved={permanent.approved}
          paid={permanent.paid}
          unpaid={permanent.unpaid}
          accent={GREEN}
          icon={BadgeIndianRupee}
          delay={0}
        />
        <SplitCard
          label="Project"
          caption="project-based incentives · YTD"
          approved={project.approved}
          paid={project.paid}
          unpaid={project.unpaid}
          accent="var(--color-blue)"
          icon={FolderKanban}
          delay={60}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-3.5 max-lg:grid-cols-1">
        <Panel
          title="Monthly Incentive"
          description="Permanent vs project per month"
          icon={<BarChart3 size={18} strokeWidth={2.3} />}
          delay={80}
        >
          <IncentiveMonthlyChart rows={monthly} />
        </Panel>
        <Panel
          title="Incentive Mix"
          description="Permanent incentives by name"
          icon={<PieChart size={18} strokeWidth={2.3} />}
          accent="var(--color-blue)"
          delay={120}
        >
          <IncentiveNameChart rows={perIncentiveName} />
        </Panel>
      </div>

      {/* Leaderboard */}
      <Panel
        title="Leaderboard"
        description="Top earners by YTD incentive"
        icon={<Trophy size={18} strokeWidth={2.3} />}
        accent="#D4AF37"
        delay={160}
      >
        {leaderboard.length === 0 ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No earners this year yet.
          </p>
        ) : (
          <>
            {podium.length >= 2 && (
              <div className="mb-6 grid grid-cols-3 gap-3 items-end max-sm:grid-cols-1">
                {orderPodium(podium).map(({ row, rank }) => (
                  <PodiumCard
                    key={row.name}
                    rank={rank}
                    name={row.name}
                    total={row.total}
                  />
                ))}
              </div>
            )}
            <ol className="space-y-2.5">
              {leaderboard.map((row, i) => {
                const share = leaderTotal > 0 ? (row.total / leaderTotal) * 100 : 0;
                return (
                  <li key={row.name} className="flex items-center gap-3">
                    <span
                      className="tabular-nums font-black text-ink-subtle w-6 text-right shrink-0"
                      style={{ fontSize: 15 }}
                    >
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      data-incentive-person={row.name}
                      aria-label={`Open ${row.name}'s incentive detail`}
                      className="shrink-0 cursor-pointer"
                    >
                      <EmployeeAvatar name={row.name} size="sm" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <button
                          type="button"
                          data-incentive-person={row.name}
                          className="truncate cursor-pointer font-bold text-ink-strong text-left transition-colors hover:text-[#A80400]"
                          style={{ fontSize: 15 }}
                        >
                          {row.name}
                        </button>
                        <span
                          className="tabular-nums font-bold text-ink-strong shrink-0"
                          style={{ fontSize: 15 }}
                        >
                          {formatInr(row.total)}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--color-hairline)" }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(2, share)}%`,
                            background: `linear-gradient(90deg, #E10600, ${RED_DEEP})`,
                          }}
                        />
                      </div>
                    </div>
                    <span
                      className="tabular-nums font-semibold text-ink-subtle w-12 text-right shrink-0"
                      style={{ fontSize: 13 }}
                    >
                      {share.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Panel>

      {/* Employee-wise YTD table — searchable + sortable */}
      <Panel
        title="Employee-wise YTD"
        description="Permanent + project totals per employee — click a person to drill down"
        icon={<Users size={18} strokeWidth={2.3} />}
        delay={200}
      >
        {perEmployee.length === 0 ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No employee incentives this year.
          </p>
        ) : (
          <IncEmployeeTable
            rows={perEmployee}
            totals={{
              permanent: permanent.approved,
              project: project.approved,
              total: empTotal,
              paid: empPaid,
              unpaid: empUnpaid,
            }}
          />
        )}
      </Panel>

      {/* Incentive-name YTD table */}
      <Panel
        title="Incentive-name YTD"
        description="Permanent ledger by incentive, with the project roll-up"
        icon={<Tags size={18} strokeWidth={2.3} />}
        accent="var(--color-blue)"
        delay={240}
      >
        {perIncentiveName.length === 0 && !projectRow ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No incentives this year.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Incentive</Th>
                  <Th align="right">Count</Th>
                  <Th align="right">YTD</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Unpaid</Th>
                </tr>
              </thead>
              <tbody>
                {perIncentiveName.map((r) => (
                  <tr
                    key={r.name}
                    className="border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                    style={{ borderColor: "var(--color-hairline)" }}
                  >
                    <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>
                      {r.name}
                    </td>
                    <Td align="right">{r.count}</Td>
                    <Td align="right" bold>{formatInr(r.approved)}</Td>
                    <Td align="right" style={{ color: GREEN_DEEP }}>
                      {formatInr(r.paid)}
                    </Td>
                    <Td align="right" style={{ color: r.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>
                      {formatInr(r.unpaid)}
                    </Td>
                  </tr>
                ))}
                {projectRow && (
                  <tr
                    className="border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                    style={{ borderColor: "var(--color-hairline)" }}
                  >
                    <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>
                      Project Based Incentive
                    </td>
                    <Td align="right">—</Td>
                    <Td align="right" bold>{formatInr(project.approved)}</Td>
                    <Td align="right" style={{ color: GREEN_DEEP }}>
                      {formatInr(project.paid)}
                    </Td>
                    <Td align="right" style={{ color: project.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>
                      {formatInr(project.unpaid)}
                    </Td>
                  </tr>
                )}
                <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <td
                    className="py-2.5 font-black uppercase tracking-[0.04em] text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    Total
                  </td>
                  <Td align="right">—</Td>
                  <Td align="right" bold>{formatInr(nameApproved + project.approved)}</Td>
                  <Td align="right" bold style={{ color: GREEN_DEEP }}>
                    {formatInr(namePaid + project.paid)}
                  </Td>
                  <Td align="right" bold style={{ color: nameUnpaid + project.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>
                    {formatInr(nameUnpaid + project.unpaid)}
                  </Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
    </IncentiveDashboardDrilldown>
  );
}

/* ─────────────────────────── podium ─────────────────────────── */

function orderPodium(
  podium: DashboardData["leaderboard"],
): { row: DashboardData["leaderboard"][number]; rank: number }[] {
  // Visual order: 2nd, 1st, 3rd (so #1 sits centre + tallest).
  const out: { row: DashboardData["leaderboard"][number]; rank: number }[] = [];
  if (podium[1]) out.push({ row: podium[1], rank: 2 });
  if (podium[0]) out.push({ row: podium[0], rank: 1 });
  if (podium[2]) out.push({ row: podium[2], rank: 3 });
  return out;
}

const PODIUM_TONE: Record<number, { medal: string; avatar: string }> = {
  1: { medal: "#D4AF37", avatar: "linear-gradient(135deg, #D4AF37, #92700c)" },
  2: { medal: "#9CA3AF", avatar: "linear-gradient(135deg, #9CA3AF, #4b5563)" },
  3: { medal: "#B45309", avatar: "linear-gradient(135deg, #d97706, #92400e)" },
};

function PodiumCard({ rank, name, total }: { rank: number; name: string; total: number }) {
  const tone = PODIUM_TONE[rank]!;
  const isFirst = rank === 1;
  return (
    <button
      type="button"
      data-incentive-person={name}
      className="wg-btn wg-sheen relative flex cursor-pointer flex-col items-center overflow-hidden rounded-[20px] bg-surface-card text-center"
      style={{
        boxShadow: isFirst
          ? `inset 0 0 0 2px ${RED}, inset 0 1px 0 rgba(255,255,255,0.7), 0 14px 34px -22px color-mix(in srgb, ${RED_DEEP} 60%, transparent)`
          : "inset 0 0 0 1px var(--color-hairline-strong), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -22px rgba(15,23,42,0.35)",
        padding: isFirst ? "22px 16px" : "16px 14px",
        border: "none",
      }}
    >
      {isFirst && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(120% 130% at 50% 0%, color-mix(in srgb, ${RED} 8%, transparent), transparent 60%)`,
          }}
        />
      )}
      <span className="relative">
        <EmployeeAvatar name={name} size={isFirst ? "lg" : "md"} background={tone.avatar} />
        <span
          className="absolute -bottom-1.5 -right-1.5 inline-flex items-center justify-center rounded-full font-black text-white"
          style={{
            background: tone.medal,
            width: isFirst ? 22 : 19,
            height: isFirst ? 22 : 19,
            fontSize: isFirst ? 12 : 10.5,
            boxShadow: "0 0 0 2px var(--color-surface-card)",
          }}
        >
          {rank}
        </span>
      </span>
      <span
        className="relative mt-2.5 font-bold text-ink-strong truncate max-w-full"
        style={{ fontSize: isFirst ? 17 : 15 }}
      >
        {name}
      </span>
      <span
        className="relative mt-1 tabular-nums font-black text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: isFirst ? 22 : 18,
        }}
      >
        {formatInr(total)}
      </span>
      <Trophy
        size={isFirst ? 18 : 15}
        strokeWidth={2.2}
        className="relative mt-1.5"
        style={{ color: tone.medal }}
        aria-hidden
      />
    </button>
  );
}
