import { Sparkles, TriangleAlert } from "lucide-react";
import type { PmsTotalResult } from "@/lib/pms/v3/total";

/**
 * PMS v3 — the overall monthly /100 TOTAL: a score ring + per-factor breakdown
 * table (earned / weight) + the X-Factor bonus line. Server-safe (no hooks).
 * When `total.pending` is true it deliberately reads as "in progress" rather than
 * showing the partial number as if it were final.
 */

const KIND_TAG: Record<string, string> = {
  objective: "Objective",
  subjective: "Subjective",
  constitution: "Constitution",
};

function Ring({
  value,
  max,
  accent,
  accentDeep,
  pending,
}: {
  value: number;
  max: number;
  accent: string;
  accentDeep: string;
  pending: boolean;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const dash = c * frac;
  const muted = "var(--color-hairline)";
  return (
    <div className="relative grid size-[132px] shrink-0 place-items-center">
      <svg viewBox="0 0 132 132" className="size-full -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke={muted} strokeWidth="12" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={pending ? "var(--color-ink-subtle)" : `url(#pms-total-grad)`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          opacity={pending ? 0.55 : 1}
        />
        <defs>
          <linearGradient id="pms-total-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} />
            <stop offset="100%" stopColor={accentDeep} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div
            className="tabular-nums leading-none"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "34px",
              letterSpacing: "-0.03em",
              color: pending ? "var(--color-ink-subtle)" : accentDeep,
            }}
          >
            {value.toFixed(1)}
          </div>
          <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            / {max}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TotalSummary({
  total,
  isManager,
  xFactorMax,
  accent,
  accentDeep,
}: {
  total: PmsTotalResult;
  isManager: boolean;
  xFactorMax: number;
  accent: string;
  accentDeep: string;
}) {
  const hasX = total.xFactor > 0;
  return (
    <section
      className="wg-rise rounded-[24px] border p-5 max-md:p-4"
      style={{
        borderColor: `color-mix(in srgb, ${accentDeep} 30%, var(--color-hairline))`,
        background: [
          `radial-gradient(130% 180% at 100% 0%, color-mix(in srgb, ${accent} 8%, transparent), transparent 55%)`,
          "var(--color-surface-card)",
        ].join(", "),
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 14px 40px -30px rgba(15,23,42,0.4)",
      }}
    >
      <div className="flex items-center gap-5 max-md:flex-col max-md:items-start max-md:gap-3">
        <Ring
          value={total.total}
          max={100 + xFactorMax}
          accent={accent}
          accentDeep={accentDeep}
          pending={total.pending}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "20px",
                letterSpacing: "-0.02em",
              }}
            >
              Overall Monthly Score
            </h2>
            <span
              className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accentDeep }}
            >
              {isManager ? "Manager band" : "Non-manager band"}
            </span>
            {total.pending && (
              <span
                className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-bold"
                style={{ background: "color-mix(in srgb, #d97706 14%, transparent)", color: "#b45309" }}
              >
                <TriangleAlert size={11} strokeWidth={2.6} /> In Progress
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-1">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Base</span>
              <div className="text-[22px] font-black tabular-nums text-ink-strong">
                {total.bandResolved ? total.base.toFixed(1) : "—"}
                <span className="ml-0.5 text-[13px] font-bold text-ink-subtle">/100</span>
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                <Sparkles size={11} strokeWidth={2.6} /> X-Factor
              </span>
              <div className="text-[22px] font-black tabular-nums" style={{ color: hasX ? accentDeep : "var(--color-ink-subtle)" }}>
                {hasX ? `+${total.xFactor.toFixed(1)}` : "+0"}
                <span className="ml-0.5 text-[13px] font-bold text-ink-subtle">/{xFactorMax}</span>
              </div>
            </div>
          </div>

          {total.pending && total.pendingReasons.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px] text-ink-muted">
              {total.pendingReasons.slice(0, 4).map((reason, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-[6px] size-1 shrink-0 rounded-full" style={{ background: "#d97706" }} />
                  {reason}
                </li>
              ))}
              {total.pendingReasons.length > 4 && (
                <li className="text-ink-subtle">+{total.pendingReasons.length - 4} more…</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Breakdown table */}
      {total.bandResolved && total.breakdown.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                <th className="py-1.5 pr-3 font-bold">Factor</th>
                <th className="py-1.5 pr-3 font-bold">Detail</th>
                <th className="py-1.5 pr-3 text-right font-bold">Earned</th>
                <th className="py-1.5 pr-3 text-right font-bold">Weight</th>
                <th className="py-1.5 pl-2 font-bold">Fill</th>
              </tr>
            </thead>
            <tbody>
              {total.breakdown.map((row) => {
                const frac = row.weight > 0 ? row.earned / row.weight : 0;
                return (
                  <tr key={row.key} className="border-t border-hairline">
                    <td className="py-2 pr-3">
                      <span className="font-bold text-ink-strong">{row.label}</span>
                      <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                        {KIND_TAG[row.kind] ?? row.kind}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">
                      {row.missing ? (
                        <span className="text-[12px] font-semibold" style={{ color: "#b45309" }}>
                          {row.detail ?? "not scored yet"}
                        </span>
                      ) : (
                        row.detail ?? "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-black tabular-nums" style={{ color: row.missing ? "var(--color-ink-subtle)" : accentDeep }}>
                      {row.earned.toFixed(1)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink-muted">{row.weight}</td>
                    <td className="py-2 pl-2 w-[120px]">
                      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(1, frac)) * 100}%`,
                            background: row.missing ? "var(--color-hairline-strong)" : `linear-gradient(90deg, ${accent}, ${accentDeep})`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: `color-mix(in srgb, ${accentDeep} 35%, var(--color-hairline))` }}>
                <td className="py-2 pr-3 font-black text-ink-strong" colSpan={2}>
                  Base {hasX ? "+ X-Factor" : ""}
                </td>
                <td className="py-2 pr-3 text-right font-black tabular-nums" style={{ color: accentDeep }}>
                  {total.total.toFixed(1)}
                </td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink-muted">
                  {hasX ? `100+${xFactorMax}` : "100"}
                </td>
                <td className="py-2 pl-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** Compact roster badge: the total /100 (or "in progress"). Server-safe. */
export function TotalBadge({
  total,
  accent,
  accentDeep,
}: {
  total: PmsTotalResult;
  accent: string;
  accentDeep: string;
}) {
  if (total.pending) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold"
        style={{ background: "color-mix(in srgb, #d97706 12%, transparent)", color: "#b45309" }}
        title={total.pendingReasons.join(" · ")}
      >
        <TriangleAlert size={11} strokeWidth={2.6} /> In Progress
        {total.bandResolved && <span className="tabular-nums opacity-70">· {total.total.toFixed(0)}</span>}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-baseline gap-0.5 rounded-pill px-3 py-1 font-black text-white"
      style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
      title={`Base ${total.base.toFixed(1)} + X-Factor ${total.xFactor.toFixed(1)}`}
    >
      <span className="text-[15px] tabular-nums">{total.total.toFixed(1)}</span>
      <span className="text-[10px] font-bold opacity-85">/100</span>
    </span>
  );
}
