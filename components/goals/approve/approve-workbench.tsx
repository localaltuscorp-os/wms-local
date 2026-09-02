"use client";

import * as React from "react";
import { CalendarClock, Users, ShieldCheck } from "lucide-react";
import { MemberApprovalCard } from "./member-approval-card";
import { type ApproveMember, allApproved } from "./types";

// Re-export the DTOs so the server page imports its prop types from one place.
export type { ApproveMember, ApproveGoal } from "./types";

// Goals identity — amber-gold (this room never uses brand red).
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

/**
 * The Monday manager-approval surface. Renders a live summary (how many of the
 * manager's downline are fully signed off — last week + this week) and one card
 * per member. When the manager has no direct reports, an empty state explains
 * there's nothing to approve. Off-Monday the surface stays usable as a preview;
 * a note clarifies the clock-in gate only fires on Mondays.
 */
export function ApproveWorkbench({
  members,
  weekStart,
  lastWeekStart,
  weekLabel,
  lastWeekLabel,
  isMonday,
}: {
  members: ApproveMember[];
  weekStart: string;
  lastWeekStart: string;
  weekLabel: string;
  lastWeekLabel: string;
  isMonday: boolean;
}) {
  const total = members.length;
  const fullyApproved = members.filter(
    (m) =>
      (m.lastWeek.length === 0 || allApproved(m.lastWeek)) &&
      (m.thisWeek.length === 0 || allApproved(m.thisWeek)),
  ).length;
  const pct = total === 0 ? 100 : Math.round((fullyApproved / total) * 100);
  const done = total > 0 && fullyApproved === total;

  if (total === 0) {
    return (
      <div className="wg-rise rounded-section border border-hairline-strong bg-surface-soft/40 p-10 text-center">
        <span
          className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl"
          style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}
        >
          <Users size={24} />
        </span>
        <p className="text-[16px] font-bold text-ink-strong">No direct reports to approve</p>
        <p className="mx-auto mt-1 max-w-md text-[14px] text-ink-muted">
          This surface lists the people who report to you. You have none right now, so the Monday
          approval gate never blocks you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary bar --------------------------------------------------- */}
      <div
        className="wg-rise relative isolate overflow-hidden rounded-section border border-hairline bg-surface-card p-5"
        style={
          {
            "--kpi-tone": ACCENT,
            "--kpi-tone-deep": ACCENT_DEEP,
          } as React.CSSProperties
        }
      >
        <div aria-hidden className="kpi-aurora-primary" style={{ "--kpi-index": 0 } as React.CSSProperties} />
        <div aria-hidden className="kpi-aurora-secondary" />
        <div className="relative z-10 flex flex-wrap items-center gap-4">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
            style={{
              background: done
                ? "linear-gradient(135deg, var(--color-green), var(--color-green-deep))"
                : `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
              color: "white",
              boxShadow: done
                ? "0 8px 20px -8px rgba(21,128,61,0.5)"
                : `0 8px 20px -8px ${ACCENT}88`,
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <div className="mr-auto">
            <p className="text-ink-strong tabular-nums" style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 24 }}>
              {fullyApproved}{" "}
              <span className="text-ink-soft" style={{ fontWeight: 700, fontSize: 16 }}>
                of {total}
              </span>{" "}
              signed off
            </p>
            <p className="text-[13px] font-semibold text-ink-muted">
              {done ? "Your team is fully approved — you're clear to clock in." : "Approve each person's last week + this week."}
            </p>
          </div>
          <div className="min-w-[160px] flex-1">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-strong/8">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  background: done
                    ? "linear-gradient(90deg, var(--color-green), var(--color-green-deep))"
                    : `linear-gradient(90deg, #E10600, ${ACCENT})`,
                }}
              />
            </div>
          </div>
        </div>

        {!isMonday && (
          <p className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-pill bg-surface-soft px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted">
            <CalendarClock size={14} style={{ color: ACCENT }} /> Preview — the clock-in approval gate is live on Mondays (IST).
          </p>
        )}
      </div>

      {/* Member cards -------------------------------------------------- */}
      {members.map((m, i) => (
        <MemberApprovalCard
          key={m.id}
          member={m}
          index={i}
          weekStart={weekStart}
          lastWeekStart={lastWeekStart}
          weekLabel={weekLabel}
          lastWeekLabel={lastWeekLabel}
        />
      ))}
    </div>
  );
}
