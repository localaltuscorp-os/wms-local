"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveTargets } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canViewModule } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { withRetry } from "@/lib/db/with-timeout";
import {
  PERIOD_KINDS,
  addMonths,
  currentMonthKey,
  formatMonthKey,
  formatQuarterKey,
  isMonthKey,
  isQuarterKey,
  quarterMonths,
} from "@/lib/incentive/analytics/periods";
import { ANALYTICS_VIEWS, type IncentiveAnalytics } from "@/lib/incentive/analytics/model";
import { loadIncentiveAnalytics } from "@/lib/queries/incentive-analytics";

/**
 * INCENTIVE DASHBOARD — server actions.
 *
 * The browser sends a PERIOD and a VIEW, and nothing else. Who is asking, what
 * they may see and the CTC figures are all resolved here on every call, so a
 * crafted request cannot name another employee or widen its own scope.
 *
 * THE VIEW IS NOT AN EXCEPTION TO THAT. It selects between the scope the server
 * already computed for this person (`team`) and that same person alone
 * (`user`) — it cannot name anybody, and neither branch produces a scope larger
 * than the one the server handed it. `applyAnalyticsView` in
 * lib/incentive/analytics/scope.ts is the single place it is honoured, and it
 * ignores a `user` request from someone who has no team to narrow from.
 */

const MODULE = "employees.incentive";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const PeriodInput = z
  .object({
    kind: z.enum(PERIOD_KINDS),
    month: z.string().max(7).nullable().optional(),
    /** "YYYY-QN" — only for kind "quarter". */
    quarter: z.string().max(7).nullable().optional(),
    /** "YYYY" — only for kind "year". */
    year: z.string().max(4).nullable().optional(),
    // Absent means `team`, which is what every caller got before the switcher
    // existed — so an old client, or a replayed request, behaves unchanged.
    view: z.enum(ANALYTICS_VIEWS).optional(),
    /**
     * The employee the dashboard is viewing, from the picker.
     *
     * A string rather than a `uuid()` so a malformed value cannot fail the whole
     * call. It is not an entitlement and cannot widen one: the loader refuses
     * anybody the caller is not already permitted to see, and an id it refuses
     * leaves the caller on their own dashboard. Refusing the request outright
     * would turn a stale link into an error card instead of a page.
     *
     * (This comment is deliberately worded to survive the structure test in
     * tests/unit/incentive-analytics.test.ts, which forbids this schema from
     * carrying an entitlement — see the note there.)
     */
    emp: z.string().max(64).nullable().optional(),
  })
  .strict();

export async function fetchIncentiveAnalytics(input: {
  kind: (typeof PERIOD_KINDS)[number];
  month?: string | null;
  quarter?: string | null;
  year?: string | null;
  view?: (typeof ANALYTICS_VIEWS)[number];
  emp?: string | null;
}): Promise<Result<{ data: IncentiveAnalytics }>> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) {
    return { ok: false, error: "You don't have access to the Incentive module." };
  }
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  const parsed = PeriodInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid period." };

  try {
    const data = await withRetry(
      () =>
        loadIncentiveAnalytics(me, parsed.data, {
          view: parsed.data.view,
          // The entitlement is resolved from the SESSION inside the loader.
          // `emp` only ever narrows it, and only to somebody it covers.
          emp: parsed.data.emp ?? null,
        }),
      {
        attempts: 2,
        timeoutMs: [9000, 14000],
        label: "incentive:analytics",
      },
    );
    if (!data) return { ok: false, error: "Choose a month between Jan 2020 and this month." };
    return { ok: true, data };
  } catch (err) {
    // A database that does not answer in time must come back as a message the
    // dashboard can show — not a thrown 500 that leaves the view frozen on the
    // previous period with no explanation.
    console.error("[incentive/analytics] load failed", err);
    return { ok: false, error: "The incentive dashboard couldn't load just now — please try again." };
  }
}

const TargetInput = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month."),
    amount: z
      .number({ message: "Enter the target amount." })
      .finite("Enter the target amount.")
      .positive("A target must be more than ₹0.")
      .max(1_000_000_000, "That target is too large."),
  })
  .strict();

/**
 * Fill in MY OWN missing incentive target — the action behind the dashboard's
 * red warning bar.
 *
 * It writes the existing `incentive_targets` row, the same table and shape the
 * admin Targets tab writes; there is no second target store. Deliberately
 * narrow:
 *  · only for the signed-in employee (name and id come from the session);
 *  · only for the current or the next month (IST);
 *  · only when no target exists yet — changing a target someone has already
 *    set stays with an admin on the Targets tab, so the warning cannot be used
 *    to lower a target after the fact.
 */
export async function setMyIncentiveTarget(input: {
  month: string;
  amount: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) {
    return { ok: false, error: "You don't have access to the Incentive module." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = TargetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid target." };
  const { month, amount } = parsed.data;

  const current = currentMonthKey();
  const next = addMonths(current, 1);
  if (month !== current && month !== next) {
    return { ok: false, error: "You can only fill in this month's or next month's target." };
  }

  const periodMonth = `${month}-01`;
  const alreadySet = {
    ok: false as const,
    error: `Your target for ${formatMonthKey(month)} is already set — ask an admin if it needs to change.`,
  };

  const existing = await db
    .select({ id: incentiveTargets.id })
    .from(incentiveTargets)
    .where(
      and(
        eq(incentiveTargets.periodMonth, periodMonth),
        // MONTHLY rows only: a quarterly target anchored on the same month is a
        // different commitment and must not block this one (migration 0250).
        eq(incentiveTargets.periodType, "month"),
        or(
          eq(incentiveTargets.employeeId, me.id),
          sql`lower(trim(${incentiveTargets.empName})) = lower(trim(${me.name}))`,
        ),
      ),
    )
    .limit(1);
  if (existing.length > 0) return alreadySet;

  const inserted = await db
    .insert(incentiveTargets)
    .values({
      empName: me.name.trim(),
      employeeId: me.id,
      periodMonth,
      targetAmount: amount.toFixed(2),
      note: "Entered by the employee from the Incentive Dashboard",
    })
    .onConflictDoNothing()
    .returning({ id: incentiveTargets.id });
  if (inserted.length === 0) return alreadySet;

  revalidatePath("/incentive");
  return { ok: true };
}

// ── period-aware self-serve target (migration 0250) ────────────────────────

/**
 * The periods the dashboard's "Set Incentive Target" control offers.
 *
 *   this_month  → the current month's row, tagged 'month'
 *   month       → a named "YYYY-MM", tagged 'month'
 *   quarter     → a named "YYYY-QN", tagged 'quarter', anchored on its first month
 *   year        → the January row of the named year, tagged 'month' — the
 *                 SAME convention `setIncentiveYearTarget` has always used, so
 *                 the year figure keeps summing into YTD exactly as before
 */
const SelfTargetKinds = ["this_month", "month", "quarter", "year"] as const;

const SelfPeriodTargetInput = z
  .object({
    kind: z.enum(SelfTargetKinds),
    /** "YYYY-MM" | "YYYY-QN" | "YYYY" depending on `kind`. */
    value: z.string().max(7).nullable().optional(),
    amount: z
      .number({ message: "Enter the target amount." })
      .finite("Enter the target amount.")
      .positive("A target must be more than ₹0.")
      .max(1_000_000_000, "That target is too large."),
  })
  .strict();

/**
 * Set MY OWN target for a month, quarter or year — the action behind the
 * dashboard's period-aware target control.
 *
 * Wider than {@link setMyIncentiveTarget} (which serves the red warning bar and
 * still only fills the CURRENT or NEXT month), but the same three rules hold:
 *  · only for the signed-in employee — name and id come from the session;
 *  · never for a period that has already ENDED, so a target cannot be rewritten
 *    after the fact to flatter a closed month or quarter;
 *  · only when no target exists yet for that exact period. Changing one already
 *    set stays with an admin on the Targets tab.
 */
export async function setMyIncentivePeriodTarget(
  input: z.input<typeof SelfPeriodTargetInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) {
    return { ok: false, error: "You don't have access to the Incentive module." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SelfPeriodTargetInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid target." };
  }
  const { kind, value, amount } = parsed.data;

  const current = currentMonthKey();
  const today = `${current}-01`;

  // Resolve the kind+value into the row we would write.
  let periodMonth: string;
  let periodType: "month" | "quarter";
  let periodEndExclusive: string;
  let label: string;

  if (kind === "this_month") {
    periodMonth = `${current}-01`;
    periodType = "month";
    periodEndExclusive = `${addMonths(current, 1)}-01`;
    label = formatMonthKey(current);
  } else if (kind === "month") {
    const m = value ?? "";
    if (!isMonthKey(m)) return { ok: false, error: "Choose a month." };
    periodMonth = `${m}-01`;
    periodType = "month";
    periodEndExclusive = `${addMonths(m, 1)}-01`;
    label = formatMonthKey(m);
  } else if (kind === "quarter") {
    const q = value ?? "";
    if (!isQuarterKey(q)) return { ok: false, error: "Choose a quarter." };
    const months = quarterMonths(q);
    const first = months[0]!;
    periodMonth = `${first}-01`;
    periodType = "quarter";
    periodEndExclusive = `${addMonths(months[2]!, 1)}-01`;
    label = formatQuarterKey(q);
  } else {
    const y = value ?? "";
    if (!/^\d{4}$/.test(y)) return { ok: false, error: "Choose a year." };
    // The long-standing year convention: the January row carries the whole-year
    // figure, which is what makes it sum into YTD (see setIncentiveYearTarget).
    periodMonth = `${y}-01-01`;
    periodType = "month";
    periodEndExclusive = `${Number(y) + 1}-01-01`;
    label = y;
  }

  // A period that has already closed cannot be given a target now.
  if (periodEndExclusive <= today) {
    return { ok: false, error: `${label} has already ended — ask an admin to set a target for it.` };
  }

  const alreadySet = {
    ok: false as const,
    error: `Your target for ${label} is already set — ask an admin if it needs to change.`,
  };

  const mine = or(
    eq(incentiveTargets.employeeId, me.id),
    sql`lower(trim(${incentiveTargets.empName})) = lower(trim(${me.name}))`,
  );
  const existing = await db
    .select({ id: incentiveTargets.id })
    .from(incentiveTargets)
    .where(
      and(
        eq(incentiveTargets.periodMonth, periodMonth),
        eq(incentiveTargets.periodType, periodType),
        mine,
      ),
    )
    .limit(1);
  if (existing.length > 0) return alreadySet;

  const inserted = await db
    .insert(incentiveTargets)
    .values({
      empName: me.name.trim(),
      employeeId: me.id,
      periodMonth,
      periodType,
      targetAmount: amount.toFixed(2),
      note: "Entered by the employee from the Incentive Dashboard",
    })
    .onConflictDoNothing()
    .returning({ id: incentiveTargets.id });
  if (inserted.length === 0) return alreadySet;

  revalidatePath("/incentive");
  return { ok: true };
}
