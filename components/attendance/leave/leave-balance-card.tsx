import type { LeaveBalance } from "@/lib/queries/leave";

/** "12 Aug 2026" from YYYY-MM-DD (no timezone drift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d).padStart(2, "0")} ${months[(m ?? 1) - 1]} ${y}`;
}

export function LeaveBalanceCard({ balance }: { balance: LeaveBalance }) {
  const noAnchor =
    !balance.beforeProbation && balance.allowance === 0 && balance.used === 0;

  return (
    <section
      className="rounded-section bg-surface-card p-6 max-md:p-5"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-5">
        <h2 className="text-[18px] font-semibold text-ink-strong">
          Paid leave balance
        </h2>
        {!balance.beforeProbation && !noAnchor && (
          <span className="text-[13px] text-ink-subtle tabular-nums">
            Cycle {prettyDate(balance.cycleStart)} → {prettyDate(balance.cycleEnd)}
          </span>
        )}
      </div>

      {balance.beforeProbation ? (
        <p className="text-[15px] text-ink-soft" style={{ lineHeight: 1.5 }}>
          Paid leave accrues from your probation-end date. You can still request
          unpaid leave below.
        </p>
      ) : noAnchor ? (
        <p className="text-[15px] text-ink-soft" style={{ lineHeight: 1.5 }}>
          No probation-end date is set yet, so paid leave isn&apos;t available.
          Ask an admin to set it. You can still request unpaid leave below.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-3">
            <Stat label="Allowance" value={balance.allowance} />
            <Stat label="Used" value={balance.used} />
            <Stat label="Remaining" value={balance.remaining} accent />
          </div>
          {balance.carryForward > 0 && (
            <p className="mt-4 text-[13px] text-ink-subtle">
              Carried forward from last cycle:{" "}
              <span className="font-semibold tabular-nums text-ink-soft">
                {balance.carryForward}
              </span>{" "}
              (shown for reference; not added to this cycle&apos;s allowance)
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg px-4 py-4 text-center"
      style={{
        background: accent ? "rgba(225,6,0,0.06)" : "var(--color-surface-soft)",
        border: accent
          ? "1px solid rgba(225,6,0,0.18)"
          : "1px solid var(--color-hairline)",
      }}
    >
      <div
        className="text-[30px] font-bold tabular-nums leading-none"
        style={{ color: accent ? "#A80400" : "var(--color-ink-strong)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </div>
    </div>
  );
}
