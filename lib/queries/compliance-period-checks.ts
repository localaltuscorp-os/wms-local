import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { dccCompliancePeriodChecks } from "@/db/schema";
import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/dcc/master-sync";
import type { CompliancePeriodKind } from "@/lib/compliance/period-checks";

export type CompliancePeriodCheck = {
  itemId: string;
  periodYear: number;
  periodMonth: number;
  weekNo: number;
  status: string;
};

export async function loadCompliancePeriodChecks(itemIds: string[], kind: CompliancePeriodKind, periodYear: number) {
  if (itemIds.length === 0) return [] as CompliancePeriodCheck[];
  try {
    return await db
      .select({
        itemId: dccCompliancePeriodChecks.itemId,
        periodYear: dccCompliancePeriodChecks.periodYear,
        periodMonth: dccCompliancePeriodChecks.periodMonth,
        weekNo: dccCompliancePeriodChecks.weekNo,
        status: dccCompliancePeriodChecks.status,
      })
      .from(dccCompliancePeriodChecks)
      .where(and(inArray(dccCompliancePeriodChecks.itemId, itemIds), eq(dccCompliancePeriodChecks.kind, kind), eq(dccCompliancePeriodChecks.periodYear, periodYear)));
  } catch (error) {
    // The rest of WCC/MCC must remain usable until the additive migration is applied.
    if (isMissingTable(error)) return [] as CompliancePeriodCheck[];
    throw error;
  }
}
