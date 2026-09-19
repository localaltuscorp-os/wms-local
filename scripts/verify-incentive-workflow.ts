/**
 * END-TO-END run of the incentive approval workflow against the REAL database,
 * inside ONE transaction that is always rolled back. Nothing is written.
 *
 * Exercises the same functions the server actions call
 * (lib/incentive/workflow-server.ts). The one layer it cannot run is the
 * Next.js session — who is signed in — which the unit suite covers.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  incentiveRequestDecisions,
  incentiveRequestSubmissions,
  incentiveRequests,
} from "@/db/schema";
import {
  fileIncentiveRequest,
  loadIncentiveRequestHistory,
  recordIncentiveDecision,
  resubmitIncentive,
} from "@/lib/incentive/workflow-server";

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

async function counts() {
  const [r] = await db.execute<{ reqs: number; subs: number; decs: number }>(
    sql`select (select count(*)::int from incentive_requests) reqs,
               (select count(*)::int from incentive_request_submissions) subs,
               (select count(*)::int from incentive_request_decisions) decs`,
  ) as unknown as { reqs: number; subs: number; decs: number }[];
  return r;
}

async function main() {
  const [manan] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`lower(${employees.email}) = 'manan@unleashed.in'`);
  const others = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.isActive, true), sql`lower(${employees.email}) <> 'manan@unleashed.in'`))
    .limit(2);
  if (!manan || others.length < 2) throw new Error("need Manan + two other active employees");
  const owner = others[0]!;
  const stranger = others[1]!;
  const before = await counts();

  const LINK = "https://example.com/evidence/case-study.pdf";
  const salesDetails = {
    introducer_first_name: "Asha", introducer_last_name: "Rao", workshop: "Productivity Shastra",
    batch_no: "PS-1", prospect_first_name: "Ravi", prospect_last_name: "K", organisation: "Acme",
    cell: "9876543210", email: "ravi@acme.com", products: "BSS", opportunity_type: "BSS Potential",
    incentive_date: "2026-09-15",
  };
  const csDetails = (h: string, extra: Record<string, string> = {}) => ({
    happiness_type: h, client_permission: "Yes", participant_first_name: "Asha", participant_last_name: "Rao",
    workshop: "Productivity Shastra", batch_no: "PS-1", link: LINK, content_quality: "Must Use",
    no_gyan_only_gain: "Yes", incentive_date: "2026-09-15", ...extra,
  });

  try {
    await db.transaction(async (tx) => {
      const T = { tx };
      const file = (type: "sales_pitch" | "client_happiness", details: Record<string, string>) =>
        fileIncentiveRequest({ employeeId: owner.id, type, details, split: null }, T);
      const decide = (id: string, action: string, note?: string) =>
        recordIncentiveDecision({ requestId: id, action, note, reviewerId: manan.id }, T);
      const resubmit = (id: string, actor: string, type: "sales_pitch" | "client_happiness", details: Record<string, string>, justification: string) =>
        resubmitIncentive({ requestId: id, actorId: actor, prepared: { employeeId: actor, type, details, split: null }, justification }, T);
      const row = async (id: string) =>
        (await tx.select().from(incentiveRequests).where(eq(incentiveRequests.id, id)))[0]!;
      const nDecisions = async (id: string) =>
        (await tx.select({ id: incentiveRequestDecisions.id }).from(incentiveRequestDecisions).where(eq(incentiveRequestDecisions.requestId, id))).length;
      // A statement expected to FAIL runs in a savepoint, so its error does not
      // abort the surrounding transaction.
      const refusedByDb = (run: (sp: typeof tx) => Promise<unknown>) =>
        tx.transaction(async (sp) => { await run(sp); }).then(() => false, () => true);

      console.log("\nNormal: Create → Pending Approval → Approved");
      {
        const { id } = await file("sales_pitch", salesDetails);
        let r = await row(id);
        check("new request is Pending Approval, submission 1", r.status === "pending" && r.submissionNo === 1, r.status);
        const subs = await tx.select().from(incentiveRequestSubmissions).where(eq(incentiveRequestSubmissions.requestId, id));
        check("Submission 1 snapshot written with it", subs.length === 1 && subs[0]!.submissionNo === 1);
        const d = await decide(id, "approve");
        r = await row(id);
        check("Approved", d.ok && r.status === "approved" && r.decidedById === manan.id && r.decidedAt != null, d);
        const [audit] = await tx.select().from(incentiveRequestDecisions).where(eq(incentiveRequestDecisions.requestId, id));
        check("audit row: request, employee, prev → new, action, reviewer, version, time",
          !!audit && audit.employeeId === owner.id && audit.previousStatus === "pending" && audit.newStatus === "approved"
          && audit.action === "approve" && audit.reviewerId === manan.id && audit.submissionNo === 1 && audit.createdAt != null, audit);
      }

      console.log("\nNormal: Not Approved → reason → Justify & Resubmit (×2) → Approved");
      {
        const { id } = await file("sales_pitch", salesDetails);
        const empty = await decide(id, "not_approve", "   ");
        check("empty rejection reason refused", !empty.ok && (await row(id)).status === "pending" && (await nDecisions(id)) === 0, empty);
        const na = await decide(id, "not_approve", "Missing supporting information");
        let r = await row(id);
        check("Not Approved with reason, reviewer and time stored", na.ok && r.status === "rejected" && r.decisionNote === "Missing supporting information" && r.decidedById === manan.id && r.decidedAt != null);
        // Key-by-key, not JSON.stringify: jsonb stores keys in its own order, so
        // identical content serialises differently from the object that went in.
        const sameDetails = (a: Record<string, string>, b: Record<string, string>) =>
          Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => a[k] === v);
        check("original request data preserved on rejection", sameDetails(r.details, salesDetails), { stored: r.details, sent: salesDetails });
        const bypass = await decide(id, "approve");
        check("reviewer cannot approve a Not Approved request without the employee resubmitting", !bypass.ok);
        const noJust = await resubmit(id, owner.id, "sales_pitch", salesDetails, "  ");
        check("empty resubmission justification refused", !noJust.ok && (await row(id)).status === "rejected", noJust);
        const other = await resubmit(id, stranger.id, "sales_pitch", salesDetails, "I'll fix it");
        check("another employee cannot resubmit it", !other.ok && (await row(id)).submissionNo === 1, other);
        const s2 = await resubmit(id, owner.id, "sales_pitch", { ...salesDetails, notes: "Added requested documentation" }, "Added requested documentation");
        r = await row(id);
        check("resubmitted → Pending Approval as submission 2", s2.ok && r.status === "pending" && r.submissionNo === 2 && r.resubmittedAt != null, s2);
        check("latest-decision cache cleared for the new version", r.decidedById === null && r.decisionNote === null);
        check("new details live on the request", r.details.notes === "Added requested documentation");
        await decide(id, "not_approve", "Still missing the invoice");
        const s3 = await resubmit(id, owner.id, "sales_pitch", { ...salesDetails, notes: "Invoice attached" }, "Invoice attached");
        check("multiple resubmissions: submission 3", s3.ok && (await row(id)).submissionNo === 3, s3);
        await decide(id, "approve");
        r = await row(id);
        check("finally Approved on submission 3", r.status === "approved" && r.submissionNo === 3);
        const h = await loadIncentiveRequestHistory(id, T);
        check("history keeps all 3 submissions", h.submissions.map((s) => s.submissionNo).join() === "1,2,3", h.submissions.map((s) => s.submissionNo));
        check("submission 1 kept its original details, untouched", h.submissions[0]!.details.notes === undefined && h.submissions[0]!.justification === null);
        check("justifications recorded on 2 and 3", h.submissions[1]!.justification === "Added requested documentation" && h.submissions[2]!.justification === "Invoice attached");
        check("history keeps every decision, each on its version",
          h.decisions.map((d) => `${d.submissionNo}:${d.action}`).join() === "1:not_approve,2:not_approve,3:approve",
          h.decisions.map((d) => `${d.submissionNo}:${d.action}`));
        check("decisions carry reviewer name and reasons", h.decisions[0]!.reviewerName != null && h.decisions[0]!.note === "Missing supporting information");
        const tamper = await refusedByDb((sp) => sp.execute(sql`update incentive_request_decisions set note = 'rewritten' where request_id = ${id}`));
        check("audit rows cannot be edited (DB trigger)", tamper);
        const tamperSub = await refusedByDb((sp) => sp.execute(sql`update incentive_request_submissions set justification = 'x' where request_id = ${id}`));
        check("submission snapshots cannot be edited (DB trigger)", tamperSub);
      }

      console.log("\nNormal: Due / Not Due / Reversed");
      {
        const a = (await file("sales_pitch", salesDetails)).id;
        check("Pending → Due", (await decide(a, "due")).ok && (await row(a)).status === "due");
        check("Due → Not Due", (await decide(a, "not_due")).ok && (await row(a)).status === "not_due");
        const b = (await file("sales_pitch", salesDetails)).id;
        check("Pending → Not Due", (await decide(b, "not_due")).ok && (await row(b)).status === "not_due");
        const c = (await file("sales_pitch", salesDetails)).id;
        const emptyRev = await decide(c, "reverse", "");
        check("empty reversal reason refused", !emptyRev.ok && (await row(c)).status === "pending", emptyRev);
        const rev = await decide(c, "reverse", "Client refunded the fee");
        const rc = await row(c);
        const [audit] = await tx.select().from(incentiveRequestDecisions).where(eq(incentiveRequestDecisions.requestId, c));
        check("Pending → Reversed with reason, previous status recorded", rev.ok && rc.status === "reversed" && audit?.previousStatus === "pending" && audit?.note === "Client refunded the fee");
        check("Reversed is final", !(await decide(c, "approve")).ok);
        const ownerTamper = await resubmit(c, owner.id, "sales_pitch", salesDetails, "undo please");
        check("employee cannot resubmit a Reversed request", !ownerTamper.ok);
        const dbNote = await refusedByDb((sp) => sp.insert(incentiveRequestDecisions).values({
          requestId: c, employeeId: owner.id, submissionNo: 1, previousStatus: "pending", newStatus: "rejected",
          action: "not_approve", reviewerId: manan.id, note: "  ",
        }));
        check("DB refuses a Not Approved audit row with a blank reason", dbNote);
      }

      console.log("\nContent: Case Study → Publish → Approved");
      {
        const { id } = await file("client_happiness", csDetails("Case Study"));
        check("normal decision (Due) refused on content", !(await decide(id, "due")).ok);
        const p = await decide(id, "publish");
        check("Publish records Approved", p.ok && (await row(id)).status === "approved");
      }

      console.log("\nContent: Case Study → Revise → employee revises → Pending Approval");
      {
        const { id } = await file("client_happiness", csDetails("Case Study"));
        const empty = await decide(id, "revise", "");
        check("empty revision note refused", !empty.ok && (await row(id)).status === "pending", empty);
        const rv = await decide(id, "revise", "Use the client's full quote");
        check("Revise → Revision Requested with note", rv.ok && (await row(id)).status === "revision_requested" && (await row(id)).decisionNote === "Use the client's full quote");
        const s2 = await resubmit(id, owner.id, "client_happiness", csDetails("Case Study", { notes: "Full quote added" }), "Added the full quote");
        const r = await row(id);
        check("revised & resubmitted → Pending Approval, submission 2", s2.ok && r.status === "pending" && r.submissionNo === 2);
        check("attachment link survives resubmission (live + snapshot 1)", r.details.link === LINK
          && (await loadIncentiveRequestHistory(id, T)).submissions[0]!.details.link === LINK);
      }

      console.log("\nContent: (Video) Interview → Not Approved → justify → Pending Approval");
      {
        const { id } = await file("client_happiness", csDetails("Interview"));
        check("empty reason refused on content Not Approved", !(await decide(id, "not_approve", "")).ok);
        check("Not Approved with reason", (await decide(id, "not_approve", "Audio is unusable")).ok && (await row(id)).status === "rejected");
        const s2 = await resubmit(id, owner.id, "client_happiness", csDetails("Interview"), "Re-recorded with a mic");
        check("justified → Pending Approval, submission 2", s2.ok && (await row(id)).status === "pending" && (await row(id)).submissionNo === 2);
        check("content flow again on the resubmission", (await decide(id, "publish")).ok);
      }

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    console.log("\n(transaction rolled back — nothing was written)");
  }

  const after = await counts();
  check("live data unchanged after the run", JSON.stringify(before) === JSON.stringify(after), { before, after });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E CRASHED:", e);
  process.exit(2);
});
