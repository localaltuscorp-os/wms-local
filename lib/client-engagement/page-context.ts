import "server-only";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { localDateString } from "@/lib/format";
import { canManageCe, canViewAnyCalendar } from "@/lib/client-engagement/access";
import { isYmd, mondayOf } from "@/lib/client-engagement/schedule";
import { ceReady, getCeSnapshot, type CeSnapshot } from "@/lib/queries/client-engagement";
import type { Employee } from "@/db/schema";

/**
 * What every Client Engagement tab starts from: who is looking, what they may
 * do, which week it is, and the snapshot. One loader, so "this week" and "may
 * transfer" mean the same thing on all six tabs.
 */
export interface CePageContext {
  me: Employee;
  ready: boolean;
  snapshot: CeSnapshot;
  /** IST today, yyyy-mm-dd. */
  today: string;
  /** Monday of the week being viewed (`?week=` or this week). */
  monday: string;
  canManage: boolean;
  canViewAny: boolean;
  /** The team-member row for the viewer, if they are on the team. */
  myMemberId: string | null;
}

const EMPTY: CeSnapshot = { members: [], accounts: [], engagements: [], references: [] };

export async function loadCePage(week?: string | null): Promise<CePageContext> {
  const me = await requireWorkspace("operations");
  // IST, like every other date in this app: a UTC "today" flips a day early
  // every evening.
  const today = localDateString("Asia/Kolkata");
  const monday = mondayOf(isYmd(week ?? "") ? week! : today);
  const ready = await ceReady();
  const snapshot = ready ? await getCeSnapshot() : EMPTY;
  const canManage = canManageCe(me, DUMMY_MODE);
  return {
    me,
    ready,
    snapshot,
    today,
    monday,
    canManage,
    canViewAny: canViewAnyCalendar(me, isSuperAdmin(me.email), DUMMY_MODE),
    myMemberId: snapshot.members.find((m) => m.employeeId === me.id)?.id ?? null,
  };
}
