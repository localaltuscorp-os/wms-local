"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import type { GoalPeriod } from "@/lib/goals/types";
import { GoalEditDialog } from "./goal-edit-dialog";
import { GOALS_ACCENT, GOALS_ACCENT_DEEP, type RosterMember } from "./util";

/** Add a standalone goal at a given level/bucket (parent_goal_id = null). */
export function AddGoalButton({
  employeeId,
  period,
  periodKey,
  roster,
  label,
  variant = "solid",
}: {
  employeeId: string;
  period: GoalPeriod;
  periodKey: string;
  roster: RosterMember[];
  label: string;
  variant?: "solid" | "ghost";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "solid"
            ? "brand-btn wg-btn wg-sheen inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white"
            : "wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
        }
        style={variant === "solid" ? { background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})` } : undefined}
      >
        <Plus size={15} strokeWidth={2.6} />
        {label}
      </button>
      <GoalEditDialog
        mode={{ kind: "create", employeeId, period, periodKey }}
        roster={roster}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
