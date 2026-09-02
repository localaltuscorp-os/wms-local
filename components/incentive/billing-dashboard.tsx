import * as React from "react";
import {
  IndianRupee,
  CheckCircle2,
  Hourglass,
  ReceiptText,
  Trophy,
  Users,
  BarChart3,
  Briefcase,
} from "lucide-react";
import { formatInr } from "@/lib/format";
import type { BillingSummary } from "@/lib/billing/sheet";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/* ── atoms (match the incentive-dashboard look) ── */

function Panel({
  title,
  description,
  icon,
  accent = "#E10600",
  delay = 0,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  accent?: string;
  delay?: number;
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
      <header className="mb-5 flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
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
          {description && <p className="text-[13px] font-medium text-ink-subtle">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  caption,
  accent,
  icon: Icon,
  delay,
  progress,
}: {
  label: string;
  value: string;
  caption: string;
  accent: string;
  icon: typeof IndianRupee;
  delay: number;
  progress?: number | null;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
        >
          <Icon size={16} strokeWidth={2.4} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(21px, 1.7vw, 27px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }} aria-hidden>
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 75%, #fff), ${accent})`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap" style={{ fontSize: 11, textAlign: align }}>{children}</th>;
}
function Td({ children, align = "left", bold = false, style }: { children: React.ReactNode; align?: "left" | "right"; bold?: boolean; style?: React.CSSProperties }) {
  return <td className={`py-2.5 tabular-nums whitespace-nowrap ${bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"}`} style={{ fontSize: 14, textAlign: align, ...style }}>{children}</td>;
}

/* ── main view ── */

export function BillingDashboard({ data }: { data: BillingSummary & { error?: string } }) {
  const { totals, perSalesperson, monthly, deals } = data;

  if (data.error) {
    return (
      <div
        className="wg-rise rounded-[22px] bg-surface-card p-7"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
      >
        <p className="font-bold text-ink-strong" style={{ fontSize: 16 }}>Couldn’t read the billing sheet</p>
        <p className="mt-1 font-semibold text-ink-subtle" style={{ fontSize: 14 }}>{data.error}</p>
      </div>
    );
  }

  if (totals.deals === 0) {
    return (
      <div
        className="wg-rise rounded-[22px] bg-surface-card p-10 text-center"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
      >
        <span
          className="mx-auto mb-4 inline-grid size-12 place-items-center rounded-2xl"
          style={{ background: `color-mix(in srgb, #E10600 10%, transparent)`, color: "#A80400" }}
          aria-hidden
        >
          <ReceiptText size={22} strokeWidth={2.2} />
        </span>
        <p className="font-bold text-ink-strong" style={{ fontSize: 16 }}>No billing this year</p>
        <p className="mt-1 font-semibold text-ink-subtle" style={{ fontSize: 14 }}>No sales-credited deals found in the Billing sheet for the selected year.</p>
      </div>
    );
  }

  const collectRate = totals.billed > 0 ? (totals.paid / totals.billed) * 100 : 0;
  const maxBilled = Math.max(...perSalesperson.map((p) => p.billed), 1);
  const maxMonth = Math.max(...monthly.map((m) => m.billed), 1);
  const podium = perSalesperson.slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <MetricCard
          label="Billing total"
          value={formatInr(totals.billed)}
          accent="#334155"
          icon={IndianRupee}
          caption={`${totals.deals} deal${totals.deals === 1 ? "" : "s"} YTD`}
          delay={0}
        />
        <MetricCard
          label="Collected"
          value={formatInr(totals.paid)}
          accent={GREEN}
          icon={CheckCircle2}
          caption={`${collectRate.toFixed(0)}% of billed`}
          progress={Math.min(collectRate / 100, 1)}
          delay={50}
        />
        <MetricCard
          label="Outstanding"
          value={formatInr(totals.outstanding)}
          accent={totals.outstanding > 0 ? "var(--color-altus-red)" : "#334155"}
          icon={Hourglass}
          caption="billed − collected"
          delay={100}
        />
        <MetricCard
          label="Salespeople"
          value={String(perSalesperson.length)}
          accent="#A80400"
          icon={ReceiptText}
          caption="credited this year"
          delay={150}
        />
      </div>

      {/* Leaderboard by billing total */}
      <Panel
        title="Billing Leaderboard"
        description="Salespeople by billing total (YTD)"
        icon={<Trophy size={18} strokeWidth={2.3} />}
        accent="#D4AF37"
        delay={80}
      >
        {podium.length >= 2 && (
          <div className="mb-6 grid grid-cols-3 gap-3 items-end max-sm:grid-cols-1">
            {orderPodium(podium).map(({ row, rank }) => (
              <PodiumCard key={row.name} rank={rank} name={row.name} total={row.billed} deals={row.deals} />
            ))}
          </div>
        )}
        <ol className="space-y-2.5">
          {perSalesperson.map((p, i) => {
            const share = (p.billed / maxBilled) * 100;
            return (
              <li key={p.name} className="flex items-center gap-3">
                <span className="tabular-nums font-black text-ink-subtle w-6 text-right shrink-0" style={{ fontSize: 15 }}>{i + 1}</span>
                <EmployeeAvatar name={p.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-bold text-ink-strong" style={{ fontSize: 15 }}>{p.name}</span>
                    <span className="tabular-nums font-bold text-ink-strong shrink-0" style={{ fontSize: 15 }}>{formatInr(p.billed)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: `linear-gradient(90deg, #E10600, #A80400)` }} />
                  </div>
                </div>
                <span className="tabular-nums font-semibold text-ink-subtle w-12 text-right shrink-0" style={{ fontSize: 13 }}>{p.deals}d</span>
              </li>
            );
          })}
        </ol>
      </Panel>

      {/* Per-salesperson table */}
      <Panel
        title="By Salesperson"
        description="Billed, collected and outstanding per person"
        icon={<Users size={18} strokeWidth={2.3} />}
        delay={120}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Salesperson</Th>
                <Th align="right">Deals</Th>
                <Th align="right">Billed</Th>
                <Th align="right">Collected</Th>
                <Th align="right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {perSalesperson.map((p) => (
                <tr
                  key={p.name}
                  className="border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <td className="py-2.5" style={{ fontSize: 14 }}>
                    <span className="flex items-center gap-2.5">
                      <EmployeeAvatar name={p.name} size="sm" />
                      <span className="font-bold text-ink-strong">{p.name}</span>
                    </span>
                  </td>
                  <Td align="right">{p.deals}</Td>
                  <Td align="right" bold>{formatInr(p.billed)}</Td>
                  <Td align="right" style={{ color: GREEN_DEEP }}>{formatInr(p.paid)}</Td>
                  <Td align="right" style={{ color: p.outstanding > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>{formatInr(p.outstanding)}</Td>
                </tr>
              ))}
              <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                <td className="py-2.5 font-black uppercase tracking-[0.04em] text-ink-strong" style={{ fontSize: 13 }}>Total</td>
                <Td align="right" bold>{totals.deals}</Td>
                <Td align="right" bold>{formatInr(totals.billed)}</Td>
                <Td align="right" bold style={{ color: GREEN_DEEP }}>{formatInr(totals.paid)}</Td>
                <Td align="right" bold style={{ color: totals.outstanding > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>{formatInr(totals.outstanding)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Monthly billing */}
      {monthly.length > 0 && (
        <Panel
          title="Monthly Billing"
          description="Billing total per month"
          icon={<BarChart3 size={18} strokeWidth={2.3} />}
          accent="var(--color-blue)"
          delay={160}
        >
          <div className="space-y-2.5">
            {monthly.map((m) => {
              const share = (m.billed / maxMonth) * 100;
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="font-semibold text-ink-subtle w-20 shrink-0" style={{ fontSize: 13 }}>{monthLabel(m.month)}</span>
                  <div className="flex-1 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: "linear-gradient(90deg, var(--color-blue), var(--color-blue-deep))" }} />
                  </div>
                  <span className="tabular-nums font-bold text-ink-strong w-28 text-right shrink-0" style={{ fontSize: 14 }}>{formatInr(m.billed)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Deal ledger */}
      <Panel
        title="Deals"
        description="Sales-credited deals, highest billed first"
        icon={<Briefcase size={18} strokeWidth={2.3} />}
        delay={200}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Salesperson</Th>
                <Th>Entity</Th>
                <Th align="right">Billed</Th>
                <Th align="right">Collected</Th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d, i) => (
                <tr
                  key={`${d.client}-${i}`}
                  className="border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <td className="py-2.5 font-semibold text-ink-strong" style={{ fontSize: 14 }}>{d.client || "—"}</td>
                  <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>{d.salesperson}</td>
                  <td className="py-2.5 font-semibold text-ink-subtle" style={{ fontSize: 13 }}>{d.entity || "—"}</td>
                  <Td align="right" bold>{formatInr(d.billed)}</Td>
                  <Td align="right" style={{ color: GREEN_DEEP }}>{formatInr(d.paid)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m)] ?? m} ${y?.slice(2)}`;
}

/* ── podium ── */

function orderPodium(podium: { name: string; billed: number; deals: number }[]) {
  const out: { row: { name: string; billed: number; deals: number }; rank: number }[] = [];
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

function PodiumCard({ rank, name, total, deals }: { rank: number; name: string; total: number; deals: number }) {
  const tone = PODIUM_TONE[rank]!;
  const isFirst = rank === 1;
  return (
    <div
      className="relative flex flex-col items-center overflow-hidden rounded-[20px] bg-surface-card text-center"
      style={{
        boxShadow: isFirst
          ? `inset 0 0 0 2px #E10600, inset 0 1px 0 rgba(255,255,255,0.7), 0 14px 34px -22px color-mix(in srgb, #A80400 60%, transparent)`
          : "inset 0 0 0 1px var(--color-hairline-strong), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -22px rgba(15,23,42,0.35)",
        padding: isFirst ? "22px 16px" : "16px 14px",
      }}
    >
      {isFirst && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(120% 130% at 50% 0%, color-mix(in srgb, #E10600 8%, transparent), transparent 60%)` }}
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
      <span className="relative mt-2.5 font-bold text-ink-strong truncate max-w-full" style={{ fontSize: isFirst ? 17 : 15 }}>{name}</span>
      <span className="relative mt-1 tabular-nums font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: isFirst ? 22 : 18 }}>{formatInr(total)}</span>
      <span className="relative mt-1 font-semibold text-ink-subtle" style={{ fontSize: 12 }}>{deals} deal{deals === 1 ? "" : "s"}</span>
      <Trophy size={isFirst ? 18 : 15} strokeWidth={2.2} className="relative mt-1.5" style={{ color: tone.medal }} aria-hidden />
    </div>
  );
}
