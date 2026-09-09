import { Plane, CalendarClock } from "lucide-react";
import type { HrPaidLeaveRecord } from "@/lib/queries/attendance-log";
import { hrDateLabel, hrNum } from "@/components/attendance/hr-record/hr-codes";

/** Status text → pill tint. Sheet values are free-text; match loosely. */
function statusTint(status: string | null): { color: string; bg: string } {
  const s = (status ?? "").toLowerCase();
  if (/run|current|active|open/.test(s)) {
    return { color: "#15803d", bg: "color-mix(in srgb, #16a34a 10%, transparent)" };
  }
  if (/complete|closed|done|over/.test(s)) {
    return { color: "#475569", bg: "color-mix(in srgb, #64748b 12%, transparent)" };
  }
  return { color: "#334155", bg: "var(--color-surface-soft)" };
}

/**
 * The HR sheet's "PAID LEAVE CALCULATION" block for one employee — DOJ,
 * every entitlement cycle, and the running total. Only rendered when a
 * matched block exists (a handful of employees have one). Read-only.
 */
export function HrPaidLeaveCard({ record }: { record: HrPaidLeaveRecord }) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "180ms",
      }}
      aria-label="Paid leave entitlement"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-grid size-9 place-items-center rounded-xl"
            style={{ background: "color-mix(in srgb, #0d9488 10%, transparent)", color: "#0d9488" }}
          >
            <Plane size={18} strokeWidth={2.3} />
          </span>
          <div>
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
              Paid Leave
            </h2>
            <p className="text-[13px] font-medium text-ink-subtle">
              Entitlement cycles from the HR sheet
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {record.doj && (
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold text-ink-muted"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <CalendarClock size={13} strokeWidth={2.4} />
              DOJ {hrDateLabel(record.doj)}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-black text-white"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
          >
            Total {hrNum(record.totalLeaves)} leaves
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-hairline">
              {["Period", "Status", "Leaves", "Remarks"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="py-2.5 pr-4 text-[11px] font-bold uppercase tracking-[0.13em] text-ink-subtle"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {record.cycles.map((c) => {
              const tint = statusTint(c.status);
              return (
                <tr key={c.id} className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft">
                  <td className="py-3 pr-4 text-[14.5px] font-bold text-ink-strong whitespace-nowrap">
                    {c.period}
                  </td>
                  <td className="py-3 pr-4">
                    {c.status ? (
                      <span
                        className="inline-flex rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
                        style={{ color: tint.color, background: tint.bg }}
                      >
                        {c.status}
                      </span>
                    ) : (
                      <span className="text-[13px] text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-[15px] font-black text-ink-strong">
                    {c.leaves != null ? hrNum(c.leaves) : "—"}
                  </td>
                  <td className="py-3 text-[13.5px] font-medium text-ink-muted">
                    {c.remarks || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
