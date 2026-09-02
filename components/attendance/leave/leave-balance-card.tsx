import { Hourglass, Info, Wallet } from "lucide-react";
import type { LeaveBalance } from "@/lib/queries/leave";

/** "12 Aug 2026" from YYYY-MM-DD (no timezone drift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d).padStart(2, "0")} ${months[(m ?? 1) - 1]} ${y}`;
}

export function LeaveBalanceCard({ balance }: { balance: LeaveBalance }) {
  // Three distinct "no paid balance" states, and they must not be conflated:
  //   · notEligible — the archetype never accrues paid leave (college shift,
  //     part-time, contract). Nothing is missing; there is nothing to set up.
  //   · beforeProbation — will accrue, hasn't started.
  //   · noAnchor — a full-timer with no probation-end date, i.e. an admin has
  //     something to fix. Only this one is an instruction.
  const notEligible = !balance.paidEligible;
  const noAnchor =
    balance.paidEligible &&
    !balance.beforeProbation &&
    balance.allowance === 0 &&
    balance.used === 0;

  const allowance = Math.max(balance.allowance, 0);
  const usedPct =
    allowance > 0 ? Math.min(100, (balance.used / allowance) * 100) : 0;
  const remainingPct =
    allowance > 0
      ? Math.min(100, Math.max(0, (balance.remaining / allowance) * 100))
      : 0;

  return (
    <section
      className="rounded-[22px] bg-surface-card p-6 max-md:p-5"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
      }}
      aria-labelledby="leave-balance-heading"
    >
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-grid size-9 place-items-center rounded-xl"
            style={{
              background: "color-mix(in srgb, #E10600 9%, transparent)",
              color: "#A80400",
            }}
          >
            <Wallet size={18} strokeWidth={2.3} />
          </span>
          <h2
            id="leave-balance-heading"
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 21,
              letterSpacing: "-0.02em",
            }}
          >
            Paid Leave Balance
          </h2>
        </div>
        {!notEligible && !balance.beforeProbation && !noAnchor && (
          <span
            className="rounded-pill px-3 py-1 text-[12.5px] font-semibold tabular-nums text-ink-subtle"
            style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            {balance.cycleLabel} · {prettyDate(balance.cycleStart)} → {prettyDate(balance.cycleEnd)}
          </span>
        )}
      </div>

      {notEligible ? (
        <Notice
          icon={<Info size={17} strokeWidth={2.3} />}
          text={`Paid leave doesn't apply to this employment type — unpaid leave only. ${balance.unpaidUsed} unpaid ${balance.unpaidUsed === 1 ? "day" : "days"} used in ${balance.cycleLabel}.`}
        />
      ) : balance.beforeProbation ? (
        <Notice
          icon={<Hourglass size={17} strokeWidth={2.3} />}
          text="Paid leave accrues from your probation-end date. You can still request unpaid leave in the meantime."
        />
      ) : noAnchor ? (
        <Notice
          icon={<Info size={17} strokeWidth={2.3} />}
          text="No probation-end date is set yet, so paid leave isn't available. Ask an admin to set it — unpaid leave requests still work."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <Stat
              label="Allowance"
              value={balance.allowance}
              unit={balance.allowance === 1 ? "day" : "days"}
              barPct={allowance > 0 ? 100 : 0}
              barColor="linear-gradient(90deg, #94A3B8, #64748B)"
            />
            <Stat
              label="Used"
              value={balance.used}
              unit={balance.used === 1 ? "day" : "days"}
              barPct={usedPct}
              barColor="linear-gradient(90deg, #F59E0B, #D97706)"
            />
            <Stat
              label="Remaining"
              value={balance.remaining}
              unit={balance.remaining === 1 ? "day" : "days"}
              barPct={remainingPct}
              barColor="linear-gradient(90deg, #E10600, #A80400)"
              accent
            />
          </div>
          {balance.carryForward > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-[13px] text-ink-subtle">
              <Info size={14} strokeWidth={2.4} className="shrink-0" />
              <span>
                Carried forward from last cycle:{" "}
                <span className="font-bold tabular-nums text-ink-soft">
                  {balance.carryForward}
                </span>{" "}
                (shown for reference; not added to this cycle&apos;s allowance)
              </span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Notice({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        background: "var(--color-surface-soft)",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <span className="mt-0.5 shrink-0 text-ink-subtle">{icon}</span>
      <p className="text-[15px] text-ink-soft" style={{ lineHeight: 1.55 }}>
        {text}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  barPct,
  barColor,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  barPct: number;
  barColor: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl px-5 py-4"
      style={{
        background: accent
          ? "color-mix(in srgb, #E10600 5%, var(--color-surface-card))"
          : "var(--color-surface-soft)",
        boxShadow: accent
          ? "inset 0 0 0 1px rgba(225,6,0,0.18)"
          : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="tabular-nums font-black leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 36,
            letterSpacing: "-0.02em",
            color: accent ? "#A80400" : "var(--color-ink-strong)",
          }}
        >
          {value}
        </span>
        <span className="text-[13px] font-semibold text-ink-subtle">{unit}</span>
      </div>
      <div
        className="mt-3 h-[4px] w-full overflow-hidden rounded-pill"
        style={{ background: "rgba(15,23,42,0.07)" }}
        aria-hidden
      >
        <div
          className="h-full rounded-pill transition-[width] duration-700"
          style={{ width: `${barPct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}
