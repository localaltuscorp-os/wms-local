"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { db } from "@/lib/db";
import { employeeExits, employees, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import {
  ArchiveEmployeeSchema,
  type ArchiveEmployeeInput,
} from "@/lib/validators/offboarding";
import {
  purgeAvatar,
  reassignOpenWork,
  type ReassignmentCounts,
} from "@/lib/employees/offboarding";
import {
  ACTIVITY_WINDOW_DAYS,
  getFormerEmployeeActivity,
} from "@/lib/queries/offboarding";

/**
 * OFFBOARDING (migration 0212).
 *
 * `archiveEmployee` REPLACES `deleteEmployee`. The old action removed a person
 * by first destroying every audit row that referenced them — because
 * `actor_id` is ON DELETE RESTRICT throughout, Postgres would not drop the
 * employee while the company own memory pointed at them, and the code answered
 * by deleting the memory. 522 audit events and 112 tasks belonging to the
 * ORGANISATION were destroyed in order to remove one login.
 *
 * This inverts that. Exactly two things are destroyed, both identity rather
 * than record:
 *   1. the Firebase user — irreversible by design; they can never sign in again
 *   2. the avatar image — no statutory basis exists for keeping a face
 *
 * Everything else is retained and re-homed. `deleteEmployee` remains in
 * `actions.ts` but is no longer reachable from the UI, and should be treated as
 * deprecated.
 */

/** A super-admin may only be archived by another super-admin. */
function guardSuperAdminTarget(
  me: { email: string },
  emp: { email: string },
): { ok: false; error: string } | null {
  if (isSuperAdmin(emp.email) && !isSuperAdmin(me.email)) {
    return { ok: false, error: "Only a super-admin can do this to another super-admin." };
  }
  return null;
}

export interface ArchiveEmployeeResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  archived?: {
    name: string;
    reassigned: ReassignmentCounts;
    firebaseDeleted: boolean;
    firebaseError: string | null;
    avatarPurged: boolean;
  };
}

export async function archiveEmployee(
  input: ArchiveEmployeeInput,
): Promise<ArchiveEmployeeResult> {
  const me = await requireAdmin();

  const parsed = ArchiveEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      fieldErrors[key] ??= issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors,
    };
  }
  const data = parsed.data;

  if (data.employeeId === me.id) {
    return { ok: false, error: "You cannot archive your own account." };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, data.employeeId),
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  const saGuard = guardSuperAdminTarget(me, emp);
  if (saGuard) return saGuard;

  if (emp.employmentStatus !== "active") {
    return { ok: false, error: `${emp.name} has already been archived.` };
  }

  // The same typed-confirmation gate the delete dialog had. The Firebase half
  // is irreversible, so the intent still has to be expressed explicitly.
  if (data.confirmationEmail.trim().toLowerCase() !== emp.email.toLowerCase()) {
    return { ok: false, error: "Confirmation email does not match." };
  }

  if (data.successorId) {
    if (data.successorId === emp.id) {
      return { ok: false, error: "Someone cannot succeed themselves." };
    }
    const successor = await db.query.employees.findFirst({
      where: eq(employees.id, data.successorId),
    });
    if (!successor) return { ok: false, error: "Successor not found." };
    // Handing live work to someone who is themselves leaving only moves the
    // problem; handing it to an inactive login loses it entirely.
    if (successor.employmentStatus !== "active" || !successor.isActive) {
      return { ok: false, error: "The successor must be an active employee." };
    }
  }

  let reassigned: ReassignmentCounts;
  let avatarPurged = false;

  try {
    reassigned = await db.transaction(async (tx) => {
      const counts = await reassignOpenWork(tx, emp.id, data.successorId ?? null);

      avatarPurged = await purgeAvatar(tx, emp.id);

      // The employee row SURVIVES. It flips to `former`, loses its login, and
      // loses the Firebase link so no identity can ever be re-attached to this
      // record — but every FK pointing at it stays valid, which is the whole
      // reason the audit trail no longer has to be destroyed.
      await tx
        .update(employees)
        .set({
          employmentStatus: "former",
          isActive: false,
          deactivatedAt: new Date(),
          firebaseUid: null,
          lastWorkingDay: data.lastWorkingDay,
          legalHold: data.legalHold,
          legalHoldReason: data.legalHold ? (data.legalHoldReason ?? null) : null,
          // A DOJ corrected on the way out belongs on the live row too, not
          // only on the exit record, or the two immediately disagree.
          ...(data.joinedAt ? { joinedAt: new Date(data.joinedAt) } : {}),
        })
        .where(eq(employees.id, emp.id));

      await tx.insert(employeeExits).values({
        employeeId: emp.id,
        exitReason: data.exitReason,
        exitReasonOther: data.exitReasonOther?.trim() || null,
        rehireEligibility: data.rehireEligibility,
        rehireNote: data.rehireNote?.trim() || null,
        joinedAt: data.joinedAt ? new Date(data.joinedAt) : (emp.joinedAt ?? null),
        resignationDate: data.resignationDate,
        lastWorkingDay: data.lastWorkingDay,
        noticeServed: data.noticeServed ?? null,
        noticeDays: data.noticeDays ?? null,
        paidInLieu: data.paidInLieu,
        successorId: data.successorId ?? null,
        reassigned: counts,
        handover: data.handover ?? {},
        exitInterview: data.exitInterview ?? null,
        notes: data.notes?.trim() || null,
        archivedById: me.id,
        avatarPurged,
      });

      return counts;
    });
  } catch (err: any) {
    // Drizzle wraps every query failure in a DrizzleQueryError whose message is
    // always "Failed query: <sql>"; the real Postgres error sits on `.cause`.
    const cause = err?.cause;
    const detail =
      [cause?.message, cause?.detail, cause?.constraint_name ?? cause?.constraint]
        .filter(Boolean)
        .join(" — ") || null;
    console.error("[archiveEmployee] transaction failed", cause ?? err);
    return { ok: false, error: `DB: ${detail ?? err?.message ?? err}` };
  }

  /**
   * FIREBASE — the irreversible half, and the only truly destructive step.
   *
   * Runs AFTER the transaction commits, deliberately. Firebase is not
   * transactional: inside the transaction, a later rollback would leave the
   * login destroyed while the row still claimed the person was employed —
   * unrecoverable, and silent. Running it after means the worst case is an
   * orphaned Firebase user, which is fixable by hand and is recorded below.
   */
  let firebaseDeleted = false;
  let firebaseError: string | null = null;
  if (emp.firebaseUid) {
    try {
      await getFirebaseAdminAuth().deleteUser(emp.firebaseUid);
      firebaseDeleted = true;
    } catch (err) {
      firebaseError = err instanceof Error ? err.message : String(err);
      console.error(
        `[archiveEmployee] firebase deleteUser(${emp.firebaseUid}) failed — remove it manually`,
        err,
      );
    }
  } else {
    // Nothing to delete is a successful outcome, not a failure: either the
    // account never had a login, or one was already removed.
    firebaseDeleted = true;
  }

  try {
    await db
      .update(employeeExits)
      .set({ firebaseDeleted, firebaseError })
      .where(eq(employeeExits.employeeId, emp.id));
  } catch (err) {
    console.error("[archiveEmployee] could not stamp the firebase outcome", err);
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "employees",
      targetId: emp.id,
      actorId: me.id,
      eventType: "employee_archived",
      fromValue: { name: emp.name, email: emp.email, role: emp.role },
      toValue: {
        exitReason: data.exitReason,
        rehireEligibility: data.rehireEligibility,
        successorId: data.successorId ?? null,
        reassigned,
        firebaseDeleted,
        avatarPurged,
        legalHold: data.legalHold,
      },
    });
  } catch (err) {
    console.error("[archiveEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);

  return {
    ok: true,
    archived: {
      name: emp.name,
      reassigned,
      firebaseDeleted,
      firebaseError,
      avatarPurged,
    },
  };
}

/**
 * Toggle a legal hold, outside the exit flow.
 *
 * Needed because the reason to freeze someone data usually arrives AFTER they
 * have gone — a claim is filed, an investigation opens. Super-admin only:
 * clearing a hold re-arms every retention timer against that person.
 */
export async function setLegalHold(
  employeeId: string,
  hold: boolean,
  reason: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only a super-admin can change a legal hold." };
  }
  if (hold && !reason?.trim()) {
    return { ok: false, error: "A legal hold needs a reason." };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  await db
    .update(employees)
    .set({ legalHold: hold, legalHoldReason: hold ? reason!.trim() : null })
    .where(eq(employees.id, employeeId));

  try {
    await db.insert(settingsEvents).values({
      scope: "employees",
      targetId: employeeId,
      actorId: me.id,
      eventType: hold ? "legal_hold_set" : "legal_hold_cleared",
      fromValue: { legalHold: emp.legalHold, reason: emp.legalHoldReason },
      toValue: { legalHold: hold, reason: hold ? reason : null },
    });
  } catch (err) {
    console.error("[setLegalHold] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

/**
 * Activity for one former employee, for the View more panel.
 *
 * `full` lifts the 60-day window and is SUPER-ADMIN ONLY. The window is a
 * display default, not a retention rule — the rows are never deleted (see
 * lib/queries/offboarding.ts) — but the ability to read someone entire history
 * after they have left is still worth gating.
 */
export async function getFormerActivity(
  employeeId: string,
  full = false,
): Promise<{
  ok: boolean;
  error?: string;
  windowDays: number | null;
  entries: { at: string; kind: string; eventType: string; detail: string | null }[];
}> {
  const me = await requireAdmin();
  const canSeeAll = isSuperAdmin(me.email);
  const windowDays = full && canSeeAll ? null : ACTIVITY_WINDOW_DAYS;

  const rows = await getFormerEmployeeActivity(employeeId, windowDays);
  return {
    ok: true,
    windowDays,
    entries: rows.map((r) => ({
      at: r.at.toISOString(),
      kind: r.kind,
      eventType: r.eventType,
      detail: r.detail,
    })),
  };
}
