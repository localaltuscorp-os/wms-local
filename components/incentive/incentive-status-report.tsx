"use client";

import * as React from "react";
import { Info, HandCoins, Wallet, BadgeCheck, Gauge } from "lucide-react";
import { formatInr } from "@/lib/format";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import type {
  IncentiveStatusReport,
  StatusTotals,
  StatusWindow,
} from "@/lib/queries/incentive-status";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const AMBER = "#d97706";

/** Booked = client partial · Accrued = client paid in full · Paid = paid to employee. */
const STATUS_META = {
  booked: { label: "Booked", color: AMBER, icon: HandCoins, hint: "client paid partial" },
  accrued: { label: "Accrued", color: GREEN, icon: Wallet, hint: "client paid in full" },
  paid: { label: "Paid", color: GREEN_DEEP, icon: BadgeCheck, hint: "paid to employee" },
} as const;

type StatusKey = keyof typeof STATUS_META;

function pct(part: number, target: number): number | null {
  if (target <= 0) return null;
  return (part / target) * 100;
}

export function IncentiveStatusReport({ report }: { report: IncentiveStatusReport }) {
  const windows: StatusWindow[] = [report.thisMonth, report.last3Months, report.ytd];

  return (
    <div className="space-y-5">
      {/* PMS clarity banner */}
      <div
        className="wg-rise flex items-start gap-3 rounded-2xl px-4.5 py-3.5"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, #A80400 8%, transparent), color-mix(in srgb, #E10600 4%, transparent))`,
          boxShadow: "inset 0 0 0 1px var(--color-hairline)",
        }}
      >
        <span
          className="mt-0.5 inline-grid size-7 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, #A80400 14%, transparent)`, color: "#A80400" }}
        >
          <Info size={15} strokeWidth={2.4} />
        </span>
        <p className="text-[13px] font-medium text-ink-soft">
          <b className="font-bold text-ink-strong">Booked</b> = client made a partial payment ·{" "}
          <b className="font-bold text-ink-strong">Accrued</b> = client paid in full ·{" "}
          <b className="font-bold text-ink-strong">Paid</b> = we paid the employee.{" "}
          <span
            className="font-bold"
            style={{ color: GREEN_DEEP }}
          >
            Performance Intelligence (PMS) counts PAID only
          </span>{" "}
          — Booked and Accrued are client-payment progress signals and never feed a score.
        </p>
      </div>

      {/* Three windows: This month · Last 3 months · YTD */}
      <div className="grid grid-cols-3 gap-3.5 max-lg:grid-cols-1">
        {windows.map((w, i) => (
          <WindowCard key={w.label} window={w} delay={i * 60} />
        ))}
      </div>

      {/* Per-person YTD table */}
      <PersonTable report={report} />
    </div>
  );
}

function WindowCard({ window: w, delay }: { window: StatusWindow; delay: number }) {
  const t: StatusTotals = w.totals;
  const keys: StatusKey[] = ["booked", "accrued", "paid"];
  const paidPct = pct(t.paid, t.target);

  return (
    <section
      className="wg-rise wg-btn rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <header className="mb-3.5 flex items-center justify-between gap-2">
        <div>
          <h3
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 17,
              letterSpacing: "-0.01em",
            }}
          >
            {w.label}
          </h3>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
            target {formatInr(t.target)}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold tabular-nums"
          style={{
            color: GREEN_DEEP,
            background: `color-mix(in srgb, ${GREEN} 12%, transparent)`,
          }}
        >
          <Gauge size={12} strokeWidth={2.6} />
          {paidPct == null ? "—" : `${paidPct.toFixed(0)}%`}
        </span>
      </header>

      <div className="space-y-3">
        {keys.map((k) => {
          const meta = STATUS_META[k];
          const value = t[k];
          const p = pct(value, t.target);
          const barPct = p == null ? 0 : Math.min(100, p);
          const Icon = meta.icon;
          return (
            <div key={k}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft">
                  <Icon size={13} strokeWidth={2.5} style={{ color: meta.color }} />
                  {meta.label}
                  <span className="font-medium text-ink-subtle">· {meta.hint}</span>
                </span>
                <span className="tabular-nums text-[13px] font-black text-ink-strong">
                  {formatInr(value)}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--color-hairline)" }}
                aria-hidden
              >
                <span
                  className="block h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(value > 0 ? 3 : 0, barPct)}%`,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${meta.color} 72%, #fff), ${meta.color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PersonTable({ report }: { report: IncentiveStatusReport }) {
  const [q, setQ] = React.useState("");
  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? report.perPersonYtd.filter((r) => r.name.toLowerCase().includes(needle))
      : report.perPersonYtd;
  }, [report.perPersonYtd, q]);

  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "200ms",
      }}
    >
      <header className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: "-0.02em",
            }}
          >
            Per-Person · Year to Date
          </h2>
          <p className="text-[13px] font-medium text-ink-subtle">
            Target vs Booked · Accrued · Paid — the <b>Attain</b> column is Paid ÷ Target (what PMS reads).
          </p>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Local search — person" title="Local search — filters only the list on this page" aria-label="Local search — person — this page only"
          className="h-10 w-full max-w-[240px] rounded-xl bg-surface-card px-3.5 text-[14px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
        />
      </header>

      {report.perPersonYtd.length === 0 ? (
        <p className="font-semibold text-ink-subtle" style={{ fontSize: 14 }}>
          No incentive activity this year yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Person</Th>
                <Th align="right">Target</Th>
                <Th align="right" color={AMBER}>Booked</Th>
                <Th align="right" color={GREEN}>Accrued</Th>
                <Th align="right" color={GREEN_DEEP}>Paid</Th>
                <Th align="right">Attain</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[14px] font-semibold text-ink-subtle">
                    No people match “{q}”.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const p = pct(r.paid, r.target);
                const tone = p == null ? "var(--color-ink-subtle)" : p >= 100 ? GREEN_DEEP : p >= 60 ? AMBER : "var(--color-red-deep)";
                return (
                  <tr
                    key={r.key}
                    className="border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                    style={{ borderColor: "var(--color-hairline)" }}
                  >
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2.5">
                        <EmployeeAvatar name={r.name} size="sm" />
                        <span className="font-bold text-ink-strong" style={{ fontSize: 13.5 }}>
                          {r.name}
                        </span>
                      </span>
                    </td>
                    <Td align="right">{r.target > 0 ? formatInr(r.target) : "—"}</Td>
                    <Td align="right">{formatInr(r.booked)}</Td>
                    <Td align="right">{formatInr(r.accrued)}</Td>
                    <Td align="right" bold color={GREEN_DEEP}>{formatInr(r.paid)}</Td>
                    <td className="py-2.5 pl-3 text-right tabular-nums font-black" style={{ fontSize: 13.5, color: tone }}>
                      {p == null ? "—" : `${p.toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
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
  color,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  color?: string;
}) {
  return (
    <th
      className="pb-2 uppercase font-bold tracking-[0.06em] whitespace-nowrap"
      style={{ fontSize: 11, textAlign: align, color: color ?? "var(--color-ink-subtle)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
  color,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
  color?: string;
}) {
  return (
    <td
      className={`py-2.5 tabular-nums whitespace-nowrap ${bold ? "font-black" : "font-semibold"}`}
      style={{ fontSize: 13.5, textAlign: align, color: color ?? (bold ? "var(--color-ink-strong)" : "var(--color-ink-soft)") }}
    >
      {children}
    </td>
  );
}
