import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";
import {
  canDeleteBillingEntity,
  canManageIncentiveEligibility,
  emailsWithCapability,
  hasCapability,
  canManageDevices,
} from "@/lib/security/capabilities";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canReviewIncentives } from "@/lib/auth/incentive-permissions";
import {
  allPermissionNodes,
  isPermissionNodeKey,
  nodeChain,
  nodeKeyForPath,
} from "@/lib/permissions/catalog";
import { ADMIN_GROUPS } from "@/components/admin/admin-nav-config";

/**
 * INCENTIVE MASTER — WHO MAY DO WHAT, AND WHERE IT IS ENFORCED.
 *
 * Two kinds of assertion, and the second is the one that keeps this true:
 *   1. the rules answer correctly today, and
 *   2. the enforcement sits in the SERVER ACTIONS — so a rule cannot be
 *      satisfied by a hidden button while the endpoint behind it stays open.
 */

const MANAN = "manan@unleashed.in";
const ROHAN = "rohanchoudhary.altuscorp@gmail.com";
const RUCHITA = "ruchitaambre.altuscorp@gmail.com";
const RUTVISHA = "rutvishamehta.altuscorp@gmail.com";
const EMPLOYEE = "someone.else@altuscorp.com";

const ACTIONS = codeOf("app/(admin)/admin/incentive-master/actions.ts");
const GUARD = codeOf("lib/incentive/eligibility-guard.ts");
const PAGE = codeOf("app/(admin)/admin/incentive-master/page.tsx");
const WORKSPACE = codeOf("components/admin/incentive-master/workspace.tsx");

/**
 * One exported action's body, cut at the NEXT exported function.
 *
 * A fixed character window would overrun into the following action and make
 * "this action does not call `requireModuleEdit`" pass or fail depending on
 * what happens to sit after it.
 */
function bodyOf(fn: string): string {
  const start = ACTIONS.indexOf(`export async function ${fn}`);
  expect(start, fn).toBeGreaterThan(-1);
  const next = ACTIONS.indexOf("export async function ", start + 1);
  return ACTIONS.slice(start, next === -1 ? undefined : next);
}

/* ════════════════════════════════════════════════════════════════════════════
   §2 + §6 · CHANGING ELIGIBILITY IS MANAN'S ALONE
   ════════════════════════════════════════════════════════════════════════════ */

describe("changing eligibility is Manan's alone", () => {
  it("Manan may", () => {
    expect(canManageIncentiveEligibility(MANAN)).toBe(true);
  });

  it("holds through the Incentive page's own dialog too, not just the Master", () => {
    /* Rohan's Incentive Table dialog writes the SAME table (it is his), through
       setIncentiveEligibility, and it was admin-only. Once the two met, that
       dialog was a way round "Manan alone" for any admin. */
    const src = codeOf("app/(app)/incentive/catalog-actions.ts");
    const at = src.indexOf("export async function setIncentiveEligibility");
    const body = src.slice(at, src.indexOf("saveEligibility(", at));
    expect(body).toMatch(/mayManageIncentiveEligibility\(\)/);
  });

  it("exactly ONE address holds the capability", () => {
    expect(emailsWithCapability("incentive_eligibility.manage")).toEqual([MANAN]);
  });

  it("nobody else may — not the other master admin, not a device admin", () => {
    for (const email of [ROHAN, RUCHITA, RUTVISHA, EMPLOYEE]) {
      expect(canManageIncentiveEligibility(email), email).toBe(false);
    }
  });

  it("being a master admin or a super-admin is not enough", () => {
    // Rohan is the most privileged person who is not Manan.
    expect(hasCapability(ROHAN, "master_admin.manage")).toBe(true);
    expect(isSuperAdmin(ROHAN)).toBe(true);
    expect(canManageIncentiveEligibility(ROHAN)).toBe(false);
  });

  it("holding every other capability is not enough", () => {
    expect(canManageDevices(RUCHITA)).toBe(true);
    expect(hasCapability(RUCHITA, "attendance.manage_others")).toBe(true);
    expect(canManageIncentiveEligibility(RUCHITA)).toBe(false);
  });

  it("fails closed on an unknown, blank or near-miss address", () => {
    expect(canManageIncentiveEligibility(null)).toBe(false);
    expect(canManageIncentiveEligibility(undefined)).toBe(false);
    expect(canManageIncentiveEligibility("")).toBe(false);
    expect(canManageIncentiveEligibility("   ")).toBe(false);
    expect(canManageIncentiveEligibility("manan@unleashed.in.evil.com")).toBe(false);
    expect(canManageIncentiveEligibility("xmanan@unleashed.in")).toBe(false);
  });

  it("matches case- and whitespace-insensitively, as sign-in does", () => {
    expect(canManageIncentiveEligibility("Manan@Unleashed.IN")).toBe(true);
    expect(canManageIncentiveEligibility("  manan@unleashed.in  ")).toBe(true);
  });

  it("is a capability of its own, not derived from being the founder", () => {
    // Keyed off `isFounderEmail`, a change of founder would silently move the
    // authority, and a second person needing it could only be added by making
    // them a founder. `canReviewIncentives` IS the founder test and answers a
    // different question — who decides a request.
    expect(canReviewIncentives(MANAN)).toBe(true);
    expect(GUARD).not.toMatch(/isFounderEmail|FOUNDER_EMAIL|isSuperAdmin|canReviewIncentives/);
    expect(codeOf("lib/security/capabilities.ts")).toMatch(/"incentive_eligibility\.manage"/);
  });

  it("is separate from the billing-delete capability it was modelled on", () => {
    // They happen to have the same single holder; they must not be one switch.
    expect(canDeleteBillingEntity(MANAN)).toBe(true);
    expect(hasCapability(MANAN, "incentive_eligibility.manage")).toBe(true);
    expect(emailsWithCapability("billing_entity.delete")).toEqual([MANAN]);
  });
});

describe("the eligibility guard is one function, consulted by both the page and the actions", () => {
  it("both the page and the actions read the same guard", () => {
    // A visible button that refuses is a bug report; a hidden one that would
    // have worked is a mystery. One source of the answer prevents both.
    expect(PAGE).toMatch(/mayManageIncentiveEligibility/);
    expect(ACTIONS).toMatch(/mayManageIncentiveEligibility/);
  });

  it("it checks BOTH the real and the effective identity", () => {
    expect(GUARD).toMatch(/getCurrentEmployee/);
    expect(GUARD).toMatch(/getSignedInEmployee/);
    expect(GUARD).toMatch(
      /canManageIncentiveEligibility\(effective\.email\)\s*&&\s*canManageIncentiveEligibility\(real\.email\)/,
    );
  });

  it("it fails closed when nobody is signed in", () => {
    expect(GUARD).toMatch(/if \(!effective \|\| !real\) return false/);
  });

  it("both eligibility actions check the capability BEFORE they read anything", () => {
    for (const fn of ["addIncentiveEligibility", "removeIncentiveEligibility"]) {
      const body = bodyOf(fn);
      const capAt = body.indexOf("mayManageIncentiveEligibility");
      const txAt = body.indexOf("db.transaction");
      expect(capAt, fn).toBeGreaterThan(-1);
      // The refusal must not depend on the incentive existing, so the answer
      // cannot differ for a valid id versus an invalid one.
      if (txAt > -1) expect(capAt, fn).toBeLessThan(txAt);
      // And it must come before the input is even parsed.
      const parseAt = body.indexOf("safeParse");
      if (parseAt > -1) expect(capAt, fn).toBeLessThan(parseAt);
    }
  });

  it("admin rights and Incentive Master edit do NOT reach eligibility", () => {
    // The two eligibility actions must not be gated by `requireModuleEdit`
    // alone — that would make any admin with edit access able to change who
    // earns. They call requireAdmin (to establish identity and rate-limit) and
    // then the capability.
    for (const fn of ["addIncentiveEligibility", "removeIncentiveEligibility"]) {
      expect(bodyOf(fn), fn).toMatch(/mayManageIncentiveEligibility/);
    }
  });

  it("the workspace re-asks the server rather than trusting the page's prop", () => {
    // The page decided `canManageChart` when it rendered; the workspace asks
    // again on open, so a permission that changed in between is reflected
    // before somebody ticks twenty employees.
    expect(WORKSPACE).toMatch(/canManageChart/);
    expect(WORKSPACE).toMatch(/setMayManage\(res\.canManageChart\)/);
    expect(ACTIONS).toMatch(/canManageChart/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §1 + §6 · THE INCENTIVE ITSELF
   ════════════════════════════════════════════════════════════════════════════ */

describe("every mutation re-authorizes for itself", () => {
  const WRITES = [
    "saveIncentive",
    "setIncentiveActive",
    "deleteIncentive",
    "addIncentiveEligibility",
    "removeIncentiveEligibility",
  ];

  it("each write action begins with requireAdmin and rate-limits", () => {
    for (const fn of WRITES) {
      const body = bodyOf(fn);
      expect(body, fn).toMatch(/requireAdmin\(\)/);
      expect(body, fn).toMatch(/rateLimitOrError\(me\.id, "write"\)/);
    }
  });

  it("the incentive-editing actions also require Incentive Master EDIT", () => {
    for (const fn of ["saveIncentive", "setIncentiveActive", "deleteIncentive"]) {
      expect(bodyOf(fn), fn).toMatch(/requireModuleEdit\(NODE\)/);
    }
  });

  it("the read action requires only VIEW, so eligibility can be seen without editing", () => {
    // "allow authorized users to see which active employees are eligible" —
    // seeing is not changing.
    const body = bodyOf("loadIncentiveWorkspace");
    expect(body).toMatch(/requireModuleView\(NODE\)/);
    expect(body).not.toMatch(/requireModuleEdit/);
  });

  it("the permission node it gates on is the registered one", () => {
    expect(ACTIONS).toMatch(/const NODE = "admin\.incentive\.master"/);
    expect(isPermissionNodeKey("admin.incentive.master")).toBe(true);
  });

  it("validates its input with zod AND the shared validator", () => {
    // A crafted request must not get past what the dialog would have refused.
    expect(ACTIONS).toMatch(/safeParse/);
    expect(ACTIONS).toMatch(/firstIncentiveMasterError/);
    expect(ACTIONS).toMatch(/eligibilityChangeError/);
  });

  it("re-checks who may be made eligible at WRITE time", () => {
    // The browser's list was rendered earlier; somebody who resigned in
    // between must not be added because their row was still on screen.
    expect(ACTIONS).toMatch(/currentEmployeeIds/);
  });
});

describe("deleting an incentive", () => {
  it("requires the typed name, checked SERVER-SIDE", () => {
    const body = bodyOf("deleteIncentive");
    expect(body).toMatch(/confirmName/);
    expect(body).toMatch(/toLowerCase\(\) !== existing\.name\.toLowerCase\(\)/);
  });

  it("snapshots BEFORE the row is deleted", () => {
    const body = bodyOf("deleteIncentive");
    const snapAt = body.indexOf("incentiveSnapshotFor(tx, existing");
    const delAt = body.indexOf("tx.delete(incentiveCatalog)");
    expect(snapAt).toBeGreaterThan(-1);
    expect(delAt).toBeGreaterThan(-1);
    // After the delete there is nothing left to snapshot, and the "deleted"
    // notice needs the before.
    expect(snapAt).toBeLessThan(delAt);
  });

  it("does not delete or block on requests, approvals or payments", () => {
    const body = bodyOf("deleteIncentive");
    // Deleting the Master row must never reach the workflow or ledger tables.
    for (const table of [
      "incentiveRequests",
      "incentiveEntries",
      "incentiveProjects",
      "incentiveParticipants",
      "incentiveRequestSubmissions",
      "incentiveRequestDecisions",
    ]) {
      expect(body, table).not.toMatch(new RegExp(`delete\\(${table}\\)`));
    }
    expect(ACTIONS).not.toMatch(/incentiveRequests|incentiveEntries|incentiveProjects/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §5 · WHERE IT LIVES
   ════════════════════════════════════════════════════════════════════════════ */

describe("the permission matrix carries Incentive Master", () => {
  it("registers the node", () => {
    expect(isPermissionNodeKey("admin.incentive")).toBe(true);
    expect(isPermissionNodeKey("admin.incentive.master")).toBe(true);
  });

  it("the route resolves to it", () => {
    expect(nodeKeyForPath("/admin/incentive-master")).toBe("admin.incentive.master");
  });

  it("sits at Admin Panel › Incentive › Incentive Master", () => {
    expect(nodeChain("admin.incentive.master")).toEqual([
      "admin",
      "admin.incentive",
      "admin.incentive.master",
    ]);
  });

  it("stays within the catalogue's three levels", () => {
    // A fourth level throws at module load.
    const node = allPermissionNodes().find((n) => n.key === "admin.incentive.master");
    expect(node?.depth).toBe(3);
  });
});

describe("the admin navigation", () => {
  it("has an Incentive group containing Incentive Master", () => {
    const group = ADMIN_GROUPS.find((g) => g.label === "Incentive");
    expect(group).toBeTruthy();
    expect(group!.items.map((i) => i.href)).toContain("/admin/incentive-master");
  });

  it("does not duplicate the entry under Masters", () => {
    const hrefs = ADMIN_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs.filter((h) => h === "/admin/incentive-master")).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §4 · NOTIFICATIONS REUSE THE EXISTING SYSTEM
   ════════════════════════════════════════════════════════════════════════════ */

describe("notifications go through the existing system", () => {
  it("the actions record an event and hand off to the existing service", () => {
    expect(ACTIONS).toMatch(/recordIncentiveCatalogEvent/);
    expect(ACTIONS).toMatch(/processIncentiveCatalogEvent/);
    // No second notification system: nothing here inserts a notification row
    // or sends an email itself.
    expect(ACTIONS).not.toMatch(/sendNotificationEmail|sendPlainEmail|getResend/);
    expect(ACTIONS).not.toMatch(/insert\(notifications\)/);
  });

  it("notifies only AFTER the change has committed", () => {
    // Nothing the notifications do can fail or slow a save that succeeded.
    expect(ACTIONS).toMatch(/afterResponse\(\(\) => processIncentiveCatalogEvent\(eventId\)\)/);
  });

  it("records the event inside the same transaction as the change", () => {
    // An Incentive Master change cannot happen without its event.
    for (const fn of ["saveIncentive", "addIncentiveEligibility", "removeIncentiveEligibility"]) {
      const body = bodyOf(fn);
      expect(body, fn).toMatch(/db\.transaction/);
      expect(body, fn).toMatch(/recordIncentiveCatalogEvent\(tx/);
    }
  });

  it("passes the CHOSEN effective date for an eligibility change", () => {
    // "Employee removed → email + app notification with effective date."
    for (const fn of ["addIncentiveEligibility", "removeIncentiveEligibility"]) {
      expect(bodyOf(fn), fn).toMatch(/effectiveDate: effectiveFrom/);
    }
  });

  it("snapshots eligibility AS OF the effective date, not as of today", () => {
    // Otherwise a future-dated change produces identical before/after
    // snapshots, records no event, and nobody is ever told.
    expect(ACTIONS).toMatch(/incentiveSnapshotFor\(tx, incentive, effectiveFrom\)/);
    expect(codeOf("lib/queries/incentive-master.ts")).toMatch(/asOf: string/);
  });

  it("the service prefers the recorded effective date over the event's own date", () => {
    const service = codeOf("lib/incentive/notifications/service.ts");
    expect(service).toMatch(/ev\.effectiveDate/);
    // …and still falls back, so events written before 0232 keep their meaning.
    expect(service).toMatch(/localDateString\("Asia\/Kolkata", ev\.createdAt\)/);
  });

  it("BOTH write paths build the snapshot with the same shared builder", () => {
    // The in-app Incentive Table dialog is the other door onto these rows. A
    // snapshot built without the eligibility list would describe a
    // named-eligibility incentive as a group one and notify the wrong people.
    const inApp = codeOf("app/(app)/incentive/catalog-actions.ts");
    expect(ACTIONS).toMatch(/incentiveSnapshotFor/);
    expect(inApp).toMatch(/incentiveSnapshotFor/);
    // And neither calls the raw row-level builder directly any more.
    expect(ACTIONS).not.toMatch(/catalogSnapshot\(/);
    expect(inApp).not.toMatch(/catalogSnapshot\(/);
  });

  it("reuses the four existing Incentive Master notification kinds", () => {
    const kinds = codeOf("lib/incentive/notifications/kinds.ts");
    for (const k of [
      "incentive_created",
      "incentive_updated",
      "incentive_eligibility_removed",
      "incentive_deleted",
    ]) {
      expect(kinds, k).toMatch(new RegExp(`"${k}"`));
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §6 · NO DUPLICATE SYSTEMS
   ════════════════════════════════════════════════════════════════════════════ */

describe("nothing was duplicated", () => {
  it("the product list is the existing Product Master", () => {
    expect(PAGE).toMatch(/listActiveProducts/);
    expect(PAGE).not.toMatch(/BSS.*PS.*OS|PRODUCTS\s*=\s*\[/);
    // And the FK points at the one product table.
    expect(codeOf("db/migrations/0232_incentive_master.sql")).toMatch(
      /references outstanding_products\(id\)/,
    );
  });

  it("no second employee table", () => {
    const migration = codeOf("db/migrations/0232_incentive_master.sql");
    expect(migration).not.toMatch(/create table if not exists incentive_employees/);
    // Nor a second ELIGIBILITY table: 0232 used to create its own
    // `incentive_eligibility`, which collided with Rohan's 0216 of the same
    // name and failed on real Postgres. The one that exists is 0216's, and it
    // points at the real employees table.
    expect(migration).not.toMatch(/create table if not exists incentive_eligibility/);
    expect(codeOf("db/migrations/0216_incentive_eligibility.sql")).toMatch(/references employees\(id\)/i);
  });

  it("the migration is additive — it drops and renames nothing", () => {
    const migration = codeOf("db/migrations/0232_incentive_master.sql");
    expect(migration).not.toMatch(/drop column|drop table|rename to|alter column .* type/i);
    // Only the append-only trigger's own function is replaced elsewhere; 0232
    // must not touch existing data.
    expect(migration).not.toMatch(/\bdelete from\b|\btruncate\b|\bupdate incentive_catalog set\b/i);
  });

  it("removal deletes the grant but keeps the incentive restricted, and dates the EVENT", () => {
    /* Was "a dated row, never a delete" — true of this module's own table,
       which the merge replaced with Rohan's (0216). That table keeps live
       grants only, so a removal is a delete. What must still hold:
         · the date is kept — on the change event, which the notice reads;
         · removing the last person must NOT reopen the incentive to everyone,
           so this action never sets applies_to_all back to true. */
    const body = bodyOf("removeIncentiveEligibility");
    expect(body).toMatch(/tx\s*\.delete\(incentiveEligibility\)/);
    expect(body).toMatch(/effectiveDate: effectiveFrom/);
    expect(body).not.toMatch(/appliesToAll:\s*true/);
  });

  it("refuses a FUTURE effective date, because the table cannot honour one", () => {
    // Rohan's table has no date on a row, so "remove with effect from 1 Nov"
    // would remove the person today. Both actions must refuse it.
    for (const fn of ["addIncentiveEligibility", "removeIncentiveEligibility"]) {
      expect(bodyOf(fn), fn).toMatch(/futureDateError\(effectiveFrom\)/);
    }
  });
});
