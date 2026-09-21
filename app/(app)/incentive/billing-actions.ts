"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { canViewModule } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getBillingDashboard } from "@/lib/queries/billing";
import { applyAnalyticsView, incentiveAnalyticsScopeFor } from "@/lib/incentive/analytics/scope";
import { visibleNameKeysFor } from "@/lib/incentive/analytics/visible-names";
import { ANALYTICS_VIEWS } from "@/lib/incentive/analytics/model";
import type { BillingSummary } from "@/lib/billing/sheet";

/**
 * BILLING — the Team / User reload, as a server action.
 *
 * The Billing ledger is read live from a Google Sheet, so it cannot be narrowed
 * by re-rendering a cached page: switching scope has to re-read. That is what
 * this action is for, and it is the whole of it — one scope, one sheet read.
 *
 * The browser sends a YEAR and a VIEW, and nothing else. The scope is resolved
 * here from the signed-in identity (`incentiveAnalyticsScopeFor`, the same
 * resolver Dashboard and Targets use — the hierarchy is never re-derived), then
 * narrowed to a set of NAME KEYS and handed to the query, which filters BEFORE
 * it aggregates. A crafted `view` therefore selects between the two scopes this
 * person already owns; it cannot name a salesperson, and it cannot widen
 * anything.
 *
 * It mirrors `fetchIncentiveAnalytics` deliberately: same module gate, same rate
 * limit, same `Result` shape, same "absent view means team" default.
 */

const MODULE = "employees.incentive";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const BillingInput = z
  .object({
    year: z.number().int().min(2020).max(2100),
    // Absent means `team` — the behaviour every caller had before the switcher.
    view: z.enum(ANALYTICS_VIEWS).optional(),
  })
  .strict();

export async function fetchIncentiveBilling(input: {
  year: number;
  view?: "team" | "user";
}): Promise<Result<{ data: BillingSummary & { error?: string }; canSeeTeam: boolean; label: string }>> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) {
    return { ok: false, error: "You don't have access to the Incentive module." };
  }
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  const parsed = BillingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid year." };

  const base = await incentiveAnalyticsScopeFor(me);
  const scope = applyAnalyticsView(base, parsed.data.view ?? "team");
  const names = await visibleNameKeysFor(scope);

  const data = await getBillingDashboard(parsed.data.year, { visibleNames: names });
  return { ok: true, data, canSeeTeam: Boolean(scope.canSeeTeam), label: scope.label };
}
