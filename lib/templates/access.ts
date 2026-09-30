import "server-only";

import { requireAdmin, requireUser } from "@/lib/auth/current";
import { requireGoalsAccess } from "@/lib/goals/access";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { requireHrStaff } from "@/lib/hr/access";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { TEMPLATE_KEYS } from "./keys";

/**
 * WHO MAY DOWNLOAD A TEMPLATE.
 *
 * Every download door asks this before it builds a byte, so the generic
 * /api/templates/[key] route is not a way AROUND the module guards the
 * per-module routes impose: downloading the Accounts workbook still requires
 * the Accounts room, the Goals workbooks still require the Goals room, and the
 * rest require a signed-in employee.
 *
 * A template file is a blank workbook, so none of this is a secret. The reason
 * it is guarded anyway is the same reason the module routes are: a URL that
 * answers for anyone is a URL somebody will build a link to.
 */
export async function requireTemplateAccess(key: string): Promise<void> {
  switch (key) {
    case TEMPLATE_KEYS.accountsTaskList:
      await requireAccountsAccess();
      return;
    case TEMPLATE_KEYS.goals:
    case TEMPLATE_KEYS.weeklyGoals:
    case TEMPLATE_KEYS.monthlyGoals:
    case TEMPLATE_KEYS.quarterlyGoals:
    case TEMPLATE_KEYS.yearlyGoals:
      await requireGoalsAccess();
      return;
    case TEMPLATE_KEYS.incentiveEntries:
      await requireAdmin();
      return;
    case TEMPLATE_KEYS.jobDescriptions:
    case TEMPLATE_KEYS.vendors:
      await requireHrStaff();
      return;
    case TEMPLATE_KEYS.operationsChecklist:
      await requireWorkspaceAdmin("operations");
      return;
    case TEMPLATE_KEYS.outstanding:
    case TEMPLATE_KEYS.collections:
      await requireWorkspaceAdmin("billing");
      return;
    default:
      await requireUser();
      return;
  }
}
