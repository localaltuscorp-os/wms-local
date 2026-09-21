/**
 * END-TO-END run of incentive notifications against the REAL database, inside
 * ONE transaction that is always rolled back.
 *
 * Nothing is written and nothing is sent: `notify()` is replaced by a recorder,
 * so no inbox row, email or push reaches anyone. Everything else is real — the
 * Incentive Master change records, the approval workflow, recipient resolution
 * from the employees table, the delivery ledger and its unique index, and the
 * content of the email each notification would send (its HTML rendering and
 * escaping are covered by tests/unit/incentive-notifications.test.ts —
 * react-dom/server cannot load under the react-server condition this needs).
 *
 *   node_modules/.bin/tsx --conditions=react-server --env-file=.env.local scripts/verify-incentive-notifications.ts
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  incentiveCatalog,
  incentiveCatalogEvents,
  incentiveNotificationDeliveries,
  incentiveRequests,
} from "@/db/schema";
import { localDateString, formatDMonY } from "@/lib/format";
import { fileIncentiveRequest, recordIncentiveDecision, resubmitIncentive } from "@/lib/incentive/workflow-server";
import {
  catalogSnapshot,
  notifyIncentiveDecision,
  notifyIncentivePaid,
  notifyIncentiveResubmitted,
  processIncentiveCatalogEvent,
  recordIncentiveCatalogEvent,
  type IncentiveDispatcher,
} from "@/lib/incentive/notifications/service";
import { incentiveEmailContent } from "@/lib/incentive/notifications/content";
import {
  isIncentiveNotificationKind,
  parseIncentiveMeta,
  type IncentiveNotificationKind,
} from "@/lib/incentive/notifications/kinds";
import type { NotifyOpts } from "@/lib/notifications/dispatch";

class Rollback extends Error {}
let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail === undefined ? "" : "  → " + JSON.stringify(detail)}`);
  }
}

const INTERN_RE = "\\m(intern|trainee|apprentice)\\M";
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function main() {
  const sent: NotifyOpts[] = [];
  const recorder: IncentiveDispatcher = async (o) => {
    sent.push(o);
  };
  const take = () => sent.splice(0);

  const liveLedgerBefore = (await db.select({ n: sql<number>`count(*)::int` }).from(incentiveNotificationDeliveries))[0]!.n;

  try {
    await db.transaction(async (tx) => {
      const ctx = { tx, dispatch: recorder };

      // ── The people, read from the real roster ──────────────────────────────
      const roster = (await tx.execute(sql`
        select e.id, e.name, e.email, e.is_active as "isActive", e.employment_status as "employmentStatus",
               coalesce(d.name, '') ~* ${INTERN_RE} as "isIntern"
        from employees e left join designations d on d.id = e.designation_id
      `)) as unknown as { id: string; name: string; email: string; isActive: boolean; employmentStatus: string; isIntern: boolean }[];
      const active = roster.filter((p) => p.isActive && p.employmentStatus === "active");
      const manan = active.find((p) => p.email.toLowerCase() === "manan@unleashed.in");
      const actor = active.find((p) => !p.isIntern && p.id !== manan?.id);
      const intern = active.find((p) => p.isIntern && p.id !== manan?.id);
      const salesPerson = active.find((p) => !p.isIntern && p.id !== manan?.id && p.id !== actor?.id);
      const inactiveIntern = roster.find((p) => p.isIntern && !p.isActive);
      if (!manan || !actor || !intern || !salesPerson) throw new Error("need Manan, an admin, an active intern and another active employee");
      const activeInterns = active.filter((p) => p.isIntern && p.id !== actor.id).map((p) => p.id);
      const activeSales = active.filter((p) => !p.isIntern && p.id !== actor.id).map((p) => p.id);

      // The email a notification would send: the content its template renders.
      const emailOf = async (o: NotifyOpts) => {
        const content = incentiveEmailContent(o.kind as IncentiveNotificationKind, parseIncentiveMeta(o.body));
        return content ? JSON.stringify(content) : null;
      };
      const eventDate = async (id: string) => {
        const [ev] = await tx.select({ createdAt: incentiveCatalogEvents.createdAt }).from(incentiveCatalogEvents).where(eq(incentiveCatalogEvents.id, id));
        return localDateString("Asia/Kolkata", ev!.createdAt);
      };
      const refusedByDb = (run: (sp: typeof tx) => Promise<unknown>) =>
        tx.transaction(async (sp) => {
          await run(sp);
        }).then(() => false, () => true);

      // ── 1. New incentive → eligible employees ─────────────────────────────
      console.log("\n1–3. New incentive (Interns only)");
      const name = `ZZ E2E notify ${Date.now()}`;
      const [created] = await tx
        .insert(incentiveCatalog)
        .values({ name, amount: "750.00", salesEligible: false, internsEligible: true, sortOrder: 999, active: true })
        .returning();
      const createdEvent = await recordIncentiveCatalogEvent(tx, {
        eventType: "created", catalogId: created!.id, before: null, after: catalogSnapshot(created!), actorId: actor.id,
      });
      check("change record written with the incentive", !!createdEvent);
      let res = await processIncentiveCatalogEvent(createdEvent!, ctx);
      let out = take();
      check("every active eligible intern is notified", sameSet(out.map((o) => o.userId), activeInterns), { got: out.length, want: activeInterns.length });
      check("each one individually, as incentive_created, in-app + email + push", out.every((o) => o.kind === "incentive_created" && JSON.stringify(o.channels) === '["email","push"]'));
      check("ineligible (sales) employee receives nothing", !out.some((o) => o.userId === salesPerson.id));
      check("inactive employee receives nothing", !inactiveIntern || !out.some((o) => o.userId === inactiveIntern.id));
      check("the admin who created it is not notified", !out.some((o) => o.userId === actor.id));
      const createdMail = await emailOf(out[0]!);
      const today = await eventDate(createdEvent!);
      check("email: name, amount, eligibility, effective date, Incentive Table link",
        !!createdMail && createdMail.includes(name) && createdMail.includes("₹750") && createdMail.includes("Interns")
        && createdMail.includes(formatDMonY(today)) && createdMail.includes("/incentive?view=table"));

      console.log("\n18. Duplicate prevention");
      res = await processIncentiveCatalogEvent(createdEvent!, ctx);
      check("replaying the same event sends nothing", take().length === 0 && res.duplicate === activeInterns.length, res);

      // ── 4. Eligibility removed / newly eligible ───────────────────────────
      console.log("\n4. Eligibility removed (Interns → Sales)");
      const [flipped] = await tx
        .update(incentiveCatalog)
        .set({ salesEligible: true, internsEligible: false })
        .where(eq(incentiveCatalog.id, created!.id))
        .returning();
      const flipEvent = await recordIncentiveCatalogEvent(tx, {
        eventType: "updated", catalogId: created!.id, before: catalogSnapshot(created!), after: catalogSnapshot(flipped!), actorId: actor.id,
      });
      await processIncentiveCatalogEvent(flipEvent!, ctx);
      out = take();
      const removed = out.filter((o) => o.kind === "incentive_eligibility_removed");
      const nowEligible = out.filter((o) => o.kind === "incentive_created");
      check("interns get 'no longer eligible'", sameSet(removed.map((o) => o.userId), activeInterns));
      check("sales get the new-incentive notice (now eligible)", sameSet(nowEligible.map((o) => o.userId), activeSales)
        && nowEligible.every((o) => parseIncentiveMeta(o.body)?.newlyEligible === true));
      check("nobody gets an 'updated' notice for an eligibility-only change", !out.some((o) => o.kind === "incentive_updated"));
      const flipDate = formatDMonY(await eventDate(flipEvent!));
      const removedMeta = parseIncentiveMeta(removed[0]!.body)!;
      check("wording + effective date from the change record",
        removedMeta.summary === `You are no longer eligible for this incentive with effect from ${flipDate}.`, removedMeta.summary);
      check("removed email carries the same date", ((await emailOf(removed[0]!)) ?? "").includes(`with effect from ${flipDate}`));

      // ── 5. Material edit ─────────────────────────────────────────────────
      console.log("\n5. Incentive edited");
      const [repriced] = await tx.update(incentiveCatalog).set({ amount: "900.00" }).where(eq(incentiveCatalog.id, created!.id)).returning();
      const priceEvent = await recordIncentiveCatalogEvent(tx, {
        eventType: "updated", catalogId: created!.id, before: catalogSnapshot(flipped!), after: catalogSnapshot(repriced!), actorId: actor.id,
      });
      await processIncentiveCatalogEvent(priceEvent!, ctx);
      out = take();
      check("affected (still eligible) employees get 'updated'", sameSet(out.map((o) => o.userId), activeSales) && out.every((o) => o.kind === "incentive_updated"));
      const updatedMail = (await emailOf(out[0]!)) ?? "";
      check("email says what changed and asks them to check the Incentive Table",
        updatedMail.includes("\"changes\"") && updatedMail.includes("₹750") && updatedMail.includes("₹900")
        && updatedMail.includes("Please check the Incentive Table for the latest details."));
      const [reordered] = await tx.update(incentiveCatalog).set({ sortOrder: 5 }).where(eq(incentiveCatalog.id, created!.id)).returning();
      const noEvent = await recordIncentiveCatalogEvent(tx, {
        eventType: "updated", catalogId: created!.id, before: catalogSnapshot(repriced!), after: catalogSnapshot(reordered!), actorId: actor.id,
      });
      check("an insignificant change (display order) records nothing and notifies no one", noEvent === null);

      // ── 6. Deleted ───────────────────────────────────────────────────────
      console.log("\n6. Incentive deleted");
      const reqCount = async () => (await tx.select({ n: sql<number>`count(*)::int` }).from(incentiveRequests))[0]!.n;
      const requestsBefore = await reqCount();
      const [gone] = await tx.select().from(incentiveCatalog).where(eq(incentiveCatalog.id, created!.id));
      await tx.delete(incentiveCatalog).where(eq(incentiveCatalog.id, created!.id));
      const delEvent = await recordIncentiveCatalogEvent(tx, {
        eventType: "deleted", catalogId: created!.id, before: catalogSnapshot(gone!), after: null, actorId: actor.id,
      });
      await processIncentiveCatalogEvent(delEvent!, ctx);
      out = take();
      check("employees who were eligible are told it is no longer available", sameSet(out.map((o) => o.userId), activeSales) && out.every((o) => o.kind === "incentive_deleted"));
      check("deleting the incentive deleted no request/approval records", (await reqCount()) === requestsBefore);
      const [evRow] = await tx.select().from(incentiveCatalogEvents).where(eq(incentiveCatalogEvents.id, delEvent!));
      check("its change record outlives it", evRow?.catalogName === name && evRow.eventType === "deleted");
      check("change records cannot be edited", await refusedByDb((sp) => sp.update(incentiveCatalogEvents).set({ catalogName: "x" }).where(eq(incentiveCatalogEvents.id, delEvent!))));

      // ── Requests ─────────────────────────────────────────────────────────
      const salesDetails = {
        introducer_first_name: "Asha", introducer_last_name: "Rao", workshop: "Productivity Shastra",
        batch_no: "PS-1", prospect_first_name: "Ravi", prospect_last_name: "K", organisation: "Acme",
        cell: "9876543210", email: "ravi@acme.com", products: "BSS", opportunity_type: "BSS Potential",
        incentive_date: "2026-09-15",
      };
      const csDetails = {
        happiness_type: "LinkedIn Testimonial", client_permission: "Yes", participant_first_name: "Asha",
        participant_last_name: "Rao", workshop: "Productivity Shastra", batch_no: "PS-1",
        link: "https://example.com/post", content_quality: "Must Use", no_gyan_only_gain: "Yes", incentive_date: "2026-09-15",
      };
      const owner = intern;
      const file = (type: "sales_pitch" | "client_happiness", details: Record<string, string>) =>
        fileIncentiveRequest({ employeeId: owner.id, type, details, split: null }, { tx });
      const decide = async (id: string, action: string, note?: string) => {
        const d = await recordIncentiveDecision({ requestId: id, action, note, reviewerId: manan.id }, { tx });
        if (!d.ok) throw new Error(`decision ${action} refused: ${d.error}`);
        return d;
      };

      console.log("\n7–8. Not Approved");
      const { id: reqA } = await file("sales_pitch", salesDetails);
      const na = await decide(reqA, "not_approve", "Missing supporting information");
      check("decision notified once", (await notifyIncentiveDecision(na, ctx)) === "sent");
      out = take();
      check("only the employee who submitted it", out.length === 1 && out[0]!.userId === owner.id && out[0]!.kind === "incentive_request_not_approved");
      const naMeta = parseIncentiveMeta(out[0]!.body)!;
      check("reason stored verbatim, link opens the request", naMeta.note === "Missing supporting information" && naMeta.href === `/incentive?request=${reqA}`);
      const naMail = (await emailOf(out[0]!)) ?? "";
      check("email: reference, type, date, amount, reason, Justify & Resubmit",
        naMail.includes(naMeta.reference!) && naMail.includes("Sales Pitch") && naMail.includes("15-Sep-2026")
        && naMail.includes("₹250") && naMail.includes("Missing supporting information") && naMail.includes("Justify & Resubmit"));
      check("processing the same decision again sends nothing", (await notifyIncentiveDecision(na, ctx)) === "duplicate" && take().length === 0);

      console.log("\n13. Resubmission → Manan");
      const rs = await resubmitIncentive(
        { requestId: reqA, actorId: owner.id, prepared: { employeeId: owner.id, type: "sales_pitch", details: salesDetails, split: null }, justification: "Added the requested documentation" },
        { tx },
      );
      if (!rs.ok) throw new Error(rs.error);
      const rsTally = await notifyIncentiveResubmitted({
        requestId: reqA, submissionId: rs.submissionId, submissionNo: rs.submissionNo, employeeId: owner.id,
        type: "sales_pitch", details: salesDetails, justification: "Added the requested documentation", submittedAt: rs.submittedAt,
      }, ctx);
      out = take();
      check("the reviewer (and only the reviewer) is notified", rsTally.sent === 1 && out.length === 1 && out[0]!.userId === manan.id && out[0]!.kind === "incentive_request_resubmitted");
      const rsMeta = parseIncentiveMeta(out[0]!.body)!;
      check("employee, type, reference, date, justification, link",
        rsMeta.summary.startsWith("An incentive request has been resubmitted.") && rsMeta.employeeName === owner.name
        && rsMeta.typeLabel === "Sales Pitch" && !!rsMeta.reference && !!rsMeta.eventAt
        && rsMeta.justification === "Added the requested documentation" && rsMeta.href === `/incentive?request=${reqA}`);

      console.log("\n9. Approved");
      const ap = await decide(reqA, "approve");
      await notifyIncentiveDecision(ap, ctx);
      out = take();
      const apMail = (await emailOf(out[0]!)) ?? "";
      check("employee notified: Approved, approved amount, approval date",
        out[0]?.kind === "incentive_request_approved" && out[0]?.userId === owner.id
        && apMail.includes("Approved amount") && apMail.includes("Approval date") && apMail.includes("₹250"));

      console.log("\n12. Reversed");
      const rv = await decide(reqA, "reverse", "Client cancelled the engagement");
      await notifyIncentiveDecision(rv, ctx);
      out = take();
      check("employee notified with the reversal reason",
        out[0]?.kind === "incentive_request_reversed" && parseIncentiveMeta(out[0]!.body)?.note === "Client cancelled the engagement"
        && ((await emailOf(out[0]!)) ?? "").includes("Reversal reason"));

      console.log("\n10. Due / Not Due");
      const { id: reqB } = await file("sales_pitch", salesDetails);
      await notifyIncentiveDecision(await decide(reqB, "due"), ctx);
      out = take();
      check("Due → employee notified (in-app + email)", out[0]?.kind === "incentive_request_due" && (await emailOf(out[0]!)) !== null);
      await notifyIncentiveDecision(await decide(reqB, "not_due"), ctx);
      out = take();
      check("Not Due → in-app notice, no email", out[0]?.kind === "incentive_request_not_due" && (await emailOf(out[0]!)) === null);

      console.log("\n14–15. Revise / Publish (LinkedIn Testimonial)");
      const { id: reqC } = await file("client_happiness", csDetails);
      await notifyIncentiveDecision(await decide(reqC, "revise", "Please add the client's consent screenshot"), ctx);
      out = take();
      check("Revise → revision notice with the mandatory note",
        out[0]?.kind === "incentive_request_revision" && parseIncentiveMeta(out[0]!.body)?.note === "Please add the client's consent screenshot"
        && ((await emailOf(out[0]!)) ?? "").includes("Revise & Resubmit"));
      const rs2 = await resubmitIncentive(
        { requestId: reqC, actorId: owner.id, prepared: { employeeId: owner.id, type: "client_happiness", details: csDetails, split: null }, justification: "Screenshot attached" },
        { tx },
      );
      check("content request resubmitted", rs2.ok);
      await notifyIncentiveDecision(await decide(reqC, "publish"), ctx);
      out = take();
      check("Publish → published notice", out[0]?.kind === "incentive_request_published" && ((await emailOf(out[0]!)) ?? "").includes("Published"));

      console.log("\n19. Failed delivery does not break the workflow");
      const { id: reqD } = await file("sales_pitch", salesDetails);
      const apD = await decide(reqD, "approve");
      const broken: IncentiveDispatcher = async () => {
        throw new Error("email provider down");
      };
      const quiet = console.error;
      console.error = () => {};
      const failedRes = await notifyIncentiveDecision(apD, { tx, dispatch: broken });
      console.error = quiet;
      const [rowD] = await tx.select({ status: incentiveRequests.status }).from(incentiveRequests).where(eq(incentiveRequests.id, reqD));
      check("delivery reports failure without throwing; the approval stands", failedRes === "failed" && rowD?.status === "approved");
      const claims = await tx.select().from(incentiveNotificationDeliveries).where(
        and(eq(incentiveNotificationDeliveries.subjectId, reqD), eq(incentiveNotificationDeliveries.versionKey, `decision:${apD.decisionId}`)),
      );
      check("the failed claim was released", claims.length === 0);
      check("a retry then delivers it", (await notifyIncentiveDecision(apD, ctx)) === "sent" && take().length === 1);

      console.log("\n11. Paid");
      const payoutId = randomUUID();
      const paid = { employeeId: salesPerson.id, subjectId: randomUUID(), versionKey: `payout-event:${payoutId}`, label: "Consulting Pitch", amount: 250, paidDate: "2026-09-30", periodMonth: "2026-09-01", actorId: actor.id };
      check("employee receives the payment notice", (await notifyIncentivePaid(paid, ctx)) === "sent");
      out = take();
      const paidMail = (await emailOf(out[0]!)) ?? "";
      check("incentive, amount, paid date", out[0]?.kind === "incentive_paid" && paidMail.includes("Consulting Pitch") && paidMail.includes("₹250") && paidMail.includes("30-Sep-2026"));
      check("the same payment event again sends nothing", (await notifyIncentivePaid(paid, ctx)) === "duplicate" && take().length === 0);

      console.log("\n2–3 / 20. Inactive recipients & recipient scope");
      await tx.update(employees).set({ isActive: false }).where(eq(employees.id, owner.id));
      const { id: reqE } = await tx
        .insert(incentiveRequests)
        .values({ employeeId: owner.id, type: "sales_pitch", details: salesDetails, status: "pending", submissionNo: 1 })
        .returning({ id: incentiveRequests.id })
        .then((r) => r[0]!);
      const inactiveRes = await notifyIncentiveDecision(await decide(reqE, "approve"), ctx);
      check("a deactivated employee receives nothing", inactiveRes === "inactive" && take().length === 0);

      const ledger = await tx
        .select({ recipientId: incentiveNotificationDeliveries.recipientId, subjectId: incentiveNotificationDeliveries.subjectId, eventType: incentiveNotificationDeliveries.eventType })
        .from(incentiveNotificationDeliveries)
        .where(sql`${incentiveNotificationDeliveries.subjectId} in (${sql.join([reqA, reqB, reqC, reqD, reqE].map((x) => sql`${x}`), sql`, `)})`);
      check("request notices went only to the request's employee, resubmissions only to Manan",
        ledger.every((l) => (l.eventType === "incentive_request_resubmitted" ? l.recipientId === manan.id : l.recipientId === owner.id)), ledger);
      check("every recorded kind is an incentive kind", ledger.every((l) => isIncentiveNotificationKind(l.eventType)));

      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }

  const liveLedgerAfter = (await db.select({ n: sql<number>`count(*)::int` }).from(incentiveNotificationDeliveries))[0]!.n;
  console.log("\nRolled back.");
  check("live database unchanged (delivery ledger)", liveLedgerAfter === liveLedgerBefore, { liveLedgerBefore, liveLedgerAfter });
  check("nothing was dispatched outside the recorder", sent.length === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
