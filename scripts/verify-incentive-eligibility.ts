import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { departments, employees, incentiveCatalog, incentiveEligibility } from "@/db/schema";
import {
  eligibilityWindowsFor,
  incentiveSnapshotFor,
  listIncentiveMaster,
  loadIncentiveEligibility,
  currentEmployeeIds,
  liveGrantIds,
} from "@/lib/queries/incentive-master";
import {
  diffCatalog,
  eligibleGroupsLabel,
  planCatalogNotifications,
  type AudienceEmployee,
} from "@/lib/incentive/notifications/eligibility";
import {
  filterCandidates,
  resolveEligibility,
  todayIst,
  windowCoversDate,
} from "@/lib/incentive/master";

/**
 * INCENTIVE CHART — verify the eligibility machinery against the REAL database.
 *
 * Usage:
 *   pnpm tsx --conditions=react-server --env-file=.env.local \
 *     scripts/verify-incentive-eligibility.ts
 *
 * ── WHY THIS EXISTS ALONGSIDE THE UNIT TESTS ───────────────────────────────
 * The unit tests prove the rules with fixtures. This proves the same rules hold
 * when the real modules are wired to the real roster: the query layer, the
 * shared snapshot builder and the notification planner, over this company's
 * actual employees, Functions and incentives.
 *
 * ── IT WRITES NOTHING AND NOTIFIES NOBODY ──────────────────────────────────
 * Every write runs inside a transaction that is rolled back by throwing a
 * sentinel at the end. `processIncentiveCatalogEvent` — the only thing that
 * dispatches a notification or an email — is NEVER called; the audience is
 * checked by asking `planCatalogNotifications` directly, which is the function
 * the dispatcher itself uses to decide who hears about a change.
 */

const ROLLBACK = "__rollback__";
let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS ${label}${extra ? " · " + extra : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${extra ? " · " + extra : ""}`);
  }
};

async function main() {
  const today = todayIst();
  console.log(`\n=== verify-incentive-eligibility · today (IST) = ${today} ===`);

  /* ── The list, over real data ──────────────────────────────────────────── */
  console.log("\n== the Incentive Master list ==");
  const t0 = Date.now();
  const rows = await listIncentiveMaster();
  console.log(`  ${rows.length} incentives loaded in ${Date.now() - t0}ms`);
  ok("the Master is not empty", rows.length > 0);
  ok(
    "every row has a finite amount — no NaN reaches the screen",
    rows.every((r) => Number.isFinite(r.amount)),
  );
  ok(
    "every row has a duration and an eligibility mode",
    rows.every((r) => ["permanent", "one_time"].includes(r.duration) && ["named", "groups"].includes(r.eligibilityMode)),
  );
  ok(
    "eligible counts are non-negative integers",
    rows.every((r) => Number.isInteger(r.eligibleCount) && r.eligibleCount >= 0),
  );
  ok(
    "on-offer is exactly active AND not expired",
    rows.every((r) => r.onOffer === (r.active && !r.expired)),
  );
  const groupMode = rows.filter((r) => r.eligibilityMode === "groups").length;
  console.log(`  ${groupMode} of ${rows.length} still use group eligibility (unchanged by this feature)`);

  /* ── The real roster, and the Function filter ──────────────────────────── */
  console.log("\n== search + the Function filter, over the real roster ==");
  const probeIncentive = rows[0]!;
  const view = await loadIncentiveEligibility(probeIncentive.id);
  ok("the eligibility screen loads for a real incentive", view != null);
  if (!view) throw new Error("no view");

  console.log(`  ${view.candidates.length} candidates · ${view.functions.length} Functions`);
  ok("candidates are offered", view.candidates.length > 0);
  ok("the Function list comes from the departments master", view.functions.length > 0);
  ok(
    "every candidate offered for a NEW grant is a current employee",
    view.candidates
      .filter((c) => c.eligibleFrom == null)
      .every((c) => c.isActive && c.employmentStatus === "active" && c.accountType === "employee"),
  );
  ok("today is resolved server-side", view.today === today, view.today);

  // The brief's worked example, against real people.
  const withFn = view.candidates.find((c) => c.departmentId && c.name.trim().includes(" "));
  if (withFn) {
    const firstName = withFn.name.trim().split(/\s+/)[0]!;
    const bySearch = filterCandidates(view.candidates, { search: firstName });
    const byFn = filterCandidates(view.candidates, { departmentId: withFn.departmentId });
    const byBoth = filterCandidates(view.candidates, {
      search: firstName,
      departmentId: withFn.departmentId,
    });
    console.log(
      `  "${firstName}" → ${bySearch.length} · Function "${withFn.departmentName}" → ${byFn.length} · both → ${byBoth.length}`,
    );
    ok("search alone finds them", bySearch.some((c) => c.id === withFn.id));
    ok("the Function alone finds them", byFn.some((c) => c.id === withFn.id));
    ok("both together still find them", byBoth.some((c) => c.id === withFn.id));
    ok(
      "both together is no wider than either alone",
      byBoth.length <= bySearch.length && byBoth.length <= byFn.length,
    );
    ok(
      "every row the Function filter returns really is in that Function",
      byFn.every((c) => c.departmentId === withFn.departmentId),
    );
    const otherFn = view.functions.find((f) => f.id !== withFn.departmentId);
    if (otherFn) {
      const contradictory = filterCandidates(view.candidates, {
        search: firstName,
        departmentId: otherFn.id,
      });
      ok(
        "a search contradicting the Function excludes them",
        !contradictory.some((c) => c.id === withFn.id),
        `${contradictory.length} rows in ${otherFn.name}`,
      );
    }
    ok("search by employee code works", withFn.employeeCode == null || filterCandidates(view.candidates, { search: withFn.employeeCode }).some((c) => c.id === withFn.id));
    ok("search by email works", filterCandidates(view.candidates, { search: withFn.email }).some((c) => c.id === withFn.id));
  } else {
    console.log("  (no candidate with a Function to test the combination with)");
  }

  /* ── The write path, inside a rolled-back transaction ──────────────────── */
  console.log("\n== granting and removing eligibility (rolled back) ==");
  const audienceRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      isActive: employees.isActive,
      employmentStatus: employees.employmentStatus,
      accountType: employees.accountType,
    })
    .from(employees);
  const audience: AudienceEmployee[] = audienceRows.map((a) => ({
    id: a.id,
    isActive: a.isActive,
    employmentStatus: a.employmentStatus,
    designation: null,
  }));
  const current = audienceRows.filter(
    (a) => a.isActive && a.employmentStatus === "active" && a.accountType === "employee",
  );
  ok("there are current employees to grant to", current.length >= 2, `${current.length}`);
  const [alice, bob] = current;
  const left = audienceRows.find((a) => a.employmentStatus !== "active" || !a.isActive);

  const FUTURE = "2026-11-01";
  const REMOVAL = "2026-12-01";

  try {
    await db.transaction(async (tx) => {
      // A probe incentive: ACTIVE, so the notification plan is non-empty and
      // the audience can actually be asserted. Nothing is dispatched, and the
      // transaction is rolled back, so no employee is ever told.
      const [probe] = await tx
        .insert(incentiveCatalog)
        .values({ name: `__verify_eligibility__ ${Date.now()}`, amount: "500.00", active: true })
        .returning();
      if (!probe) throw new Error("probe insert failed");

      const before = await incentiveSnapshotFor(tx, probe, FUTURE);
      ok("a fresh incentive has NO named eligibility", before.eligibleEmployeeIds === undefined);
      ok("its audience label falls back to the groups", eligibleGroupsLabel(before) === "No one");

      // Who may be granted, asked at write time.
      const allowed = await currentEmployeeIds(tx);
      ok("the write-time roster matches the read-time one", allowed.size === current.length, `${allowed.size}`);
      if (left) ok("someone who has left is NOT in the write-time roster", !allowed.has(left.id), left.name);

      // An ALREADY-NAMED incentive is the case where an as-of-today snapshot
      // pair hides a future-dated change: the mode does not flip, so the only
      // difference between the two snapshots is people who are not yet in
      // force, and as of today there is nothing to see.
      await tx
        .insert(incentiveEligibility)
        .values({ catalogId: probe.id, employeeId: bob!.id, effectiveFrom: "2026-01-01" });
      const named = await incentiveSnapshotFor(tx, probe, today);
      ok("the incentive now has a named list", (named.eligibleEmployeeIds ?? []).length === 1);

      await tx
        .insert(incentiveEligibility)
        .values({ catalogId: probe.id, employeeId: alice!.id, effectiveFrom: FUTURE });

      const maskedAfter = await incentiveSnapshotFor(tx, probe, today);
      ok(
        "as of TODAY, adding a FUTURE grant looks like no change at all",
        diffCatalog(named, maskedAfter).length === 0,
      );
      const datedAfter = await incentiveSnapshotFor(tx, probe, FUTURE);
      ok(
        "as of the effective date it is a real change — which is why the date is used",
        diffCatalog(named, datedAfter).some((c) => c.field === "eligibleEmployeeIds"),
      );
      const maskedPlan = planCatalogNotifications({
        eventType: "updated",
        before: named,
        after: maskedAfter,
        employees: audience,
        actorId: null,
      });
      ok(
        "so a today-based snapshot would notify NOBODY about the new grant (the bug)",
        maskedPlan.newlyEligible.length === 0,
      );
      const datedPlan = planCatalogNotifications({
        eventType: "updated",
        before: named,
        after: datedAfter,
        employees: audience,
        actorId: null,
      });
      ok(
        "and the date-based snapshot correctly notifies the newly-eligible person",
        datedPlan.newlyEligible.length === 1 && datedPlan.newlyEligible[0] === alice!.id,
        `${datedPlan.newlyEligible.length}`,
      );

      // Put both on the same footing for the rest of the checks.
      await tx
        .update(incentiveEligibility)
        .set({ effectiveFrom: FUTURE })
        .where(eq(incentiveEligibility.catalogId, probe.id));

      const live = await liveGrantIds(tx, probe.id);
      ok("both grants are live", live.size === 2 && live.has(alice!.id) && live.has(bob!.id));

      const afterAsOfEffective = await incentiveSnapshotFor(tx, probe, FUTURE);
      const afterAsOfToday = await incentiveSnapshotFor(tx, probe, today);
      ok(
        "as of the effective date, both are named eligible",
        (afterAsOfEffective.eligibleEmployeeIds ?? []).length === 2,
      );
      ok(
        "as of TODAY neither future grant is in force yet",
        (afterAsOfToday.eligibleEmployeeIds ?? []).length === 0,
      );
      const realDiff = diffCatalog(before, afterAsOfEffective);
      ok(
        "while the pair taken as of the effective date DOES show the change",
        realDiff.some((c) => c.field === "eligibleEmployeeIds"),
        realDiff.map((c) => `${c.label}: ${c.from}→${c.to}`).join("; "),
      );
      ok(
        "and the change line counts people rather than leaking ids",
        realDiff.every((c) => !/[0-9a-f]{8}-[0-9a-f]{4}/.test(`${c.from}${c.to}`)),
      );

      // The audience the dispatcher would use.
      const plan = planCatalogNotifications({
        eventType: "updated",
        before,
        after: afterAsOfEffective,
        employees: audience,
        actorId: null,
      });
      ok(
        "exactly the two granted employees are told they are now eligible",
        plan.newlyEligible.length === 2 &&
          plan.newlyEligible.includes(alice!.id) &&
          plan.newlyEligible.includes(bob!.id),
        `${plan.newlyEligible.length}`,
      );
      ok("nobody is told they were removed", plan.removed.length === 0);
      ok("nobody who was never eligible is told anything", plan.updated.length === 0);

      // Removing one of them, with its own effective date.
      const beforeRemoval = await incentiveSnapshotFor(tx, probe, REMOVAL);
      await tx
        .update(incentiveEligibility)
        .set({ removedEffectiveFrom: REMOVAL, removedById: alice!.id })
        .where(eq(incentiveEligibility.employeeId, alice!.id));
      const afterRemoval = await incentiveSnapshotFor(tx, probe, REMOVAL);
      const removalPlan = planCatalogNotifications({
        eventType: "updated",
        before: beforeRemoval,
        after: afterRemoval,
        employees: audience,
        actorId: null,
      });
      ok(
        "only the removed employee is told they are no longer eligible",
        removalPlan.removed.length === 1 && removalPlan.removed[0] === alice!.id,
        `${removalPlan.removed.length}`,
      );
      ok("the person still eligible is not told anything", !removalPlan.removed.includes(bob!.id));

      // The row survives the removal — it is a history, not a delete.
      const windows = await eligibilityWindowsFor(tx, probe.id);
      ok("both grant rows still exist after the removal", windows.length === 2);
      const aliceWindow = windows.find((w) => w.employeeId === alice!.id)!;
      ok("the removed grant kept its original start date", aliceWindow.effectiveFrom === FUTURE);
      ok("and records the removal date", aliceWindow.removedEffectiveFrom === REMOVAL);
      ok("the last eligible day is the day before the removal", windowCoversDate(aliceWindow, "2026-11-30"));
      ok("and the removal date itself is not eligible", !windowCoversDate(aliceWindow, REMOVAL));

      // Named eligibility governs: the group flags are ignored once anyone is named.
      await tx
        .update(incentiveCatalog)
        .set({ salesEligible: true, internsEligible: true })
        .where(eq(incentiveCatalog.id, probe.id));
      const [flagged] = await tx.select().from(incentiveCatalog).where(eq(incentiveCatalog.id, probe.id));
      const resolved = resolveEligibility({
        incentive: {
          active: true,
          validUntil: null,
          salesEligible: true,
          internsEligible: true,
          },
        windows: await eligibilityWindowsFor(tx, probe.id),
        employees: audienceRows.map((a) => ({
          id: a.id,
          isActive: a.isActive,
          employmentStatus: a.employmentStatus,
          accountType: a.accountType,
          designation: null,
        })),
        // As of the REMOVAL date: the removed grant has ended, so exactly one
        // named person remains. Resolving as of the grant date instead would
        // correctly return both, which is a different question.
        today: REMOVAL,
      });
      ok("named eligibility overrides both group flags", resolved.mode === "named");
      ok(
        "so only the named, still-live employee is eligible — not the whole company",
        resolved.employeeIds.length === 1 && resolved.employeeIds[0] === bob!.id,
        `${resolved.employeeIds.length} of ${current.length} employees`,
      );
      // And with both flags on, group mode WOULD have reached everybody — which
      // is what the named list is protecting against.
      const ifGroups = resolveEligibility({
        incentive: { active: true, validUntil: null, salesEligible: true, internsEligible: true },
        windows: [],
        employees: audienceRows.map((a) => ({
          id: a.id,
          isActive: a.isActive,
          employmentStatus: a.employmentStatus,
          accountType: a.accountType,
          designation: null,
        })),
        today: REMOVAL,
      });
      ok(
        "the same flags in group mode would have reached the whole company",
        ifGroups.employeeIds.length === current.length && ifGroups.mode === "groups",
        `${ifGroups.employeeIds.length} employees`,
      );
      void flagged;

      // A DEACTIVATED incentive tells nobody — the property the browser probe relies on.
      const [off] = await tx
        .update(incentiveCatalog)
        .set({ active: false })
        .where(eq(incentiveCatalog.id, probe.id))
        .returning();
      const offSnapshot = await incentiveSnapshotFor(tx, off!, FUTURE);
      const offPlan = planCatalogNotifications({
        eventType: "created",
        before: null,
        after: offSnapshot,
        employees: audience,
        actorId: null,
      });
      ok("an inactive incentive has an empty audience", offPlan.created.length === 0);

      throw new Error(ROLLBACK);
    });
    ok("the probe transaction was rolled back", false, "it committed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === ROLLBACK) ok("the probe transaction was rolled back", true);
    else {
      ok("the probe transaction ran without error", false, msg.slice(0, 160));
    }
  }

  /* ── Nothing was left behind ───────────────────────────────────────────── */
  console.log("\n== nothing was left behind ==");
  const leftovers = await db
    .select({ id: incentiveCatalog.id, name: incentiveCatalog.name })
    .from(incentiveCatalog);
  ok(
    "no probe incentive survives",
    !leftovers.some((r) => r.name.startsWith("__verify_eligibility__")),
  );
  const grants = await db.select({ id: incentiveEligibility.id }).from(incentiveEligibility);
  console.log(`  incentive_eligibility rows: ${grants.length}`);
  const [deptCount] = await db.select({ id: departments.id }).from(departments).limit(1);
  ok("the departments master is untouched and readable", deptCount != null);

  console.log(`\n=== PASS: ${pass} · FAIL: ${fail} · ${fail === 0 ? "ALL PASS" : "FAILURES"} ===`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
