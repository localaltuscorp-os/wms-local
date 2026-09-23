import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INCENTIVE_STATUSES, INCENTIVE_STATUS_LABELS } from "@/db/enums";
import {
  CONTENT_REVIEW_HAPPINESS_TYPES,
  DECISION_ACTIONS,
  DECISION_RESULT,
  JUSTIFICATION_REQUIRED_MESSAGE,
  NOTE_MAX,
  availableDecisions,
  canResubmit,
  checkDecision,
  checkResubmission,
  decisionNoteLabel,
  decisionRequiresNote,
  isContentReviewRequest,
  needsReview,
} from "@/lib/incentive/workflow";
import { canReviewIncentives } from "@/lib/auth/incentive-permissions";

/**
 * INCENTIVE APPROVAL, REJECTION AND RESUBMISSION (0230).
 *
 * The rules (lib/incentive/workflow.ts) are tested exhaustively here because
 * they are pure. The boundaries that cannot run without a request — who may
 * decide, who may resubmit, that a status change always writes its audit row —
 * are asserted structurally against the source, the same way the request-form
 * suite checks both entry points use one gate.
 */

const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SALES = { type: "sales_pitch", details: { incentive_date: "2026-09-15" } } as const;
const caseStudy = (h = "Case Study") => ({ type: "client_happiness", details: { happiness_type: h } }) as const;

describe("states", () => {
  it("labels every state, with Not Approved stored as `rejected`", () => {
    for (const s of INCENTIVE_STATUSES) expect(INCENTIVE_STATUS_LABELS[s]).toBeTruthy();
    expect(INCENTIVE_STATUS_LABELS.rejected).toBe("Not Approved");
    expect(INCENTIVE_STATUS_LABELS.pending).toBe("Pending Approval");
    expect(INCENTIVE_STATUSES).toEqual(
      expect.arrayContaining(["approved", "rejected", "due", "not_due", "reversed", "revision_requested"]),
    );
  });

  it("maps every decision onto a real state", () => {
    for (const a of DECISION_ACTIONS) expect(INCENTIVE_STATUSES).toContain(DECISION_RESULT[a]);
    expect(DECISION_RESULT.publish).toBe("approved");
    expect(DECISION_RESULT.revise).toBe("revision_requested");
    expect(DECISION_RESULT.not_approve).toBe("rejected");
    expect(DECISION_RESULT.reverse).toBe("reversed");
  });
});

describe("which flow a request is reviewed with", () => {
  it("treats LinkedIn Testimonial, (Video) Interview and Case Study as content", () => {
    for (const h of CONTENT_REVIEW_HAPPINESS_TYPES) expect(isContentReviewRequest("client_happiness", { happiness_type: h })).toBe(true);
  });

  it("keeps every other incentive on the normal flow", () => {
    expect(isContentReviewRequest("client_happiness", { happiness_type: "Google Review" })).toBe(false);
    expect(isContentReviewRequest("client_happiness", { happiness_type: "Video Testimonial" })).toBe(false);
    expect(isContentReviewRequest("sales_pitch", { happiness_type: "Case Study" })).toBe(false);
    expect(isContentReviewRequest("client_happiness", null)).toBe(false);
  });
});

describe("controlled transitions", () => {
  it("offers the five normal decisions from Pending Approval, in order", () => {
    expect(availableDecisions(SALES.type, SALES.details, "pending")).toEqual([
      "approve",
      "not_approve",
      "due",
      "not_due",
      "reverse",
    ]);
  });

  it("offers Publish / Revise / Not Approved for content", () => {
    const c = caseStudy();
    expect(availableDecisions(c.type, c.details, "pending")).toEqual(["publish", "revise", "not_approve"]);
  });

  it("gives the reviewer nothing to do on a request waiting for the employee", () => {
    for (const s of ["rejected", "revision_requested"]) {
      expect(availableDecisions(SALES.type, SALES.details, s)).toEqual([]);
      expect(availableDecisions(caseStudy().type, caseStudy().details, s)).toEqual([]);
    }
  });

  it("treats Reversed as final", () => {
    expect(availableDecisions(SALES.type, SALES.details, "reversed")).toEqual([]);
  });

  it("lets an Approved incentive be Reversed, and nothing else", () => {
    expect(availableDecisions(SALES.type, SALES.details, "approved")).toEqual(["reverse"]);
    expect(availableDecisions(caseStudy().type, caseStudy().details, "approved")).toEqual([]);
  });

  it("keeps Due and Not Due open for a final decision", () => {
    expect(availableDecisions(SALES.type, SALES.details, "due")).toEqual(["approve", "not_approve", "not_due", "reverse"]);
    expect(availableDecisions(SALES.type, SALES.details, "not_due")).toEqual(["approve", "not_approve", "due", "reverse"]);
  });

  it("queues exactly the open review states", () => {
    expect(["pending", "due", "not_due"].every(needsReview)).toBe(true);
    expect(["approved", "rejected", "reversed", "revision_requested"].some(needsReview)).toBe(false);
  });
});

describe("checkDecision — mandatory reasons", () => {
  const decide = (action: string, note?: string, base: { type: string; details: Record<string, string> } = SALES, status = "pending") =>
    checkDecision({ type: base.type, details: base.details, status, action, note });

  it("refuses Not Approved with an empty reason, with the brief's sentence", () => {
    expect(decide("not_approve", "")).toEqual({
      ok: false,
      error: "Please provide a reason before marking this incentive as Not Approved.",
    });
  });

  it("refuses a reason that is only whitespace", () => {
    expect(decide("not_approve", "   \n  ").ok).toBe(false);
  });

  it("refuses a negative payable adjustment with an empty reason", () => {
    // The reviewer's action is now named for what it produces.
    expect(decide("reverse", "")).toMatchObject({
      ok: false,
      error: expect.stringContaining("negative payable adjustment"),
    });
  });

  it("refuses Revise with an empty note", () => {
    expect(decide("revise", "", caseStudy())).toMatchObject({ ok: false, error: expect.stringContaining("revision note") });
  });

  it("requires a note for exactly Not Approved, the adjustment and Revise", () => {
    expect(DECISION_ACTIONS.filter(decisionRequiresNote).sort()).toEqual(["not_approve", "reverse", "revise"]);
    expect(decisionNoteLabel("revise")).toBe("Revision Note");
    expect(decisionNoteLabel("not_approve")).toBe("Reason / Notes");
  });

  it("accepts Approved, Due and Not Due without a note", () => {
    expect(decide("approve")).toEqual({ ok: true, action: "approve", newStatus: "approved", note: null });
    expect(decide("due")).toMatchObject({ ok: true, newStatus: "due" });
    expect(decide("not_due")).toMatchObject({ ok: true, newStatus: "not_due" });
  });

  it("records Publish as Approved", () => {
    expect(decide("publish", undefined, caseStudy())).toMatchObject({ ok: true, newStatus: "approved" });
  });

  it("trims the note it stores", () => {
    expect(decide("not_approve", "  Missing supporting link  ")).toMatchObject({ ok: true, note: "Missing supporting link" });
  });

  it("refuses a note over the limit", () => {
    expect(decide("not_approve", "x".repeat(NOTE_MAX + 1)).ok).toBe(false);
  });

  it("refuses a normal decision on content, and a content decision on a normal request", () => {
    expect(decide("due", undefined, caseStudy()).ok).toBe(false);
    expect(decide("publish").ok).toBe(false);
  });

  it("refuses to decide a request the employee must resubmit — the workflow cannot be bypassed", () => {
    const r = decide("approve", undefined, SALES, "rejected");
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("resubmit") });
  });

  it("refuses anything on a Reversed request, and unknown decisions", () => {
    expect(decide("approve", undefined, SALES, "reversed").ok).toBe(false);
    expect(decide("delete").ok).toBe(false);
    expect(decide("").ok).toBe(false);
  });
});

describe("checkResubmission", () => {
  it("allows only Not Approved and Revision Requested", () => {
    expect(canResubmit("rejected")).toBe(true);
    expect(canResubmit("revision_requested")).toBe(true);
    for (const s of ["pending", "approved", "due", "not_due", "reversed"]) expect(canResubmit(s)).toBe(false);
  });

  it("refuses an empty justification with the brief's sentence", () => {
    expect(checkResubmission({ status: "rejected", justification: "  " })).toEqual({
      ok: false,
      error: JUSTIFICATION_REQUIRED_MESSAGE,
    });
  });

  it("refuses resubmitting something already awaiting review", () => {
    expect(checkResubmission({ status: "pending", justification: "again" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("already awaiting review"),
    });
  });

  it("refuses resubmitting an Approved incentive — no self-service status change", () => {
    expect(checkResubmission({ status: "approved", justification: "please" }).ok).toBe(false);
  });

  it("accepts a real justification, trimmed", () => {
    expect(checkResubmission({ status: "revision_requested", justification: " Added the case study PDF. " })).toEqual({
      ok: true,
      justification: "Added the case study PDF.",
    });
  });
});

describe("who may decide", () => {
  it("is Manan Vasa, case-insensitively", () => {
    expect(canReviewIncentives("manan@unleashed.in")).toBe(true);
    expect(canReviewIncentives("  MANAN@unleashed.in ")).toBe(true);
  });

  it("is nobody else — not other super-admins, not admins, not a missing session", () => {
    expect(canReviewIncentives("rohanchoudhary.altuscorp@gmail.com")).toBe(false);
    expect(canReviewIncentives("vinalpatil.altuscorp@gmail.com")).toBe(false);
    expect(canReviewIncentives(null)).toBe(false);
    expect(canReviewIncentives("")).toBe(false);
  });
});

describe("server-side boundaries (structural)", () => {
  const actions = code("app/(app)/incentive/actions.ts");
  const server = code("lib/incentive/workflow-server.ts");
  const mobile = code("app/api/mobile/incentive/route.ts");
  const migration = code("db/migrations/0230_incentive_approval_workflow.sql");

  it("checks the reviewer permission inside the decision action, before any write", () => {
    const fn = actions.slice(actions.indexOf("export async function decideIncentiveRequest"));
    const body = fn.slice(0, fn.indexOf("\nexport async function"));
    expect(body.indexOf("canReviewIncentives(me.email)")).toBeGreaterThan(-1);
    expect(body.indexOf("canReviewIncentives(me.email)")).toBeLessThan(body.indexOf("recordIncentiveDecision("));
    // The old "any admin, any verdict" path is gone: nothing imports or calls
    // requireAdmin (the doc comment is allowed to say it USED to).
    expect(actions).not.toMatch(/import\s*\{[^}]*\brequireAdmin\b[^}]*\}\s*from/);
    expect(actions).not.toMatch(/await requireAdmin\(/);
    expect(actions).not.toMatch(/verdict: z\.enum/);
  });

  it("lets only the owner resubmit, and takes the type from the stored request", () => {
    expect(actions).toMatch(/row\.employeeId !== me\.id/);
    expect(actions).toMatch(/prepareIncentiveRequest\(me\.id, \{\s*type: row\.type/);
    expect(server).toMatch(/row\.employeeId !== input\.actorId/);
  });

  it("locks the row, guards the update on state + version, and writes the audit row in the same transaction", () => {
    expect(server).toMatch(/\.for\("update"\)/);
    expect(server).toMatch(/eq\(incentiveRequests\.status, row\.status\)/);
    expect(server).toMatch(/eq\(incentiveRequests\.submissionNo, row\.submissionNo\)/);
    const decide = server.slice(server.indexOf("export async function recordIncentiveDecision"), server.indexOf("export async function resubmitIncentive"));
    expect(decide).toMatch(/insert\(incentiveRequestDecisions\)/);
    const resubmit = server.slice(server.indexOf("export async function resubmitIncentive"), server.indexOf("export async function loadIncentiveRequestHistory"));
    expect(resubmit).toMatch(/insert\(incentiveRequestSubmissions\)/);
    expect(resubmit).toMatch(/submissionNo: nextNo/);
  });

  it("files every request — web and mobile — with its Submission 1 snapshot", () => {
    expect(actions).toMatch(/fileIncentiveRequest\(prepared\.values\)/);
    expect(mobile).toMatch(/fileIncentiveRequest\(prepared\.values\)/);
    expect(mobile).not.toMatch(/insert\(incentiveRequests\)/);
    const file = server.slice(server.indexOf("export async function fileIncentiveRequest"), server.indexOf("export interface DecisionOutcome"));
    expect(file).toMatch(/insert\(incentiveRequestSubmissions\)/);
  });

  it("replaces the closed status list rather than dropping it", () => {
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS incentive_requests_status_check/);
    expect(migration).toMatch(/ADD CONSTRAINT incentive_requests_status_check CHECK \(\s*status IN \('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested'\)/);
  });

  it("holds the mandatory reason, justification and immutability in the database too", () => {
    expect(migration).toMatch(/incentive_request_decisions_note_chk/);
    expect(migration).toMatch(/incentive_request_submissions_justification_chk/);
    expect(migration).toMatch(/BEFORE UPDATE ON incentive_request_submissions/);
    expect(migration).toMatch(/BEFORE UPDATE ON incentive_request_decisions/);
    // Idempotent backfill.
    expect(migration.match(/WHERE NOT EXISTS|AND NOT EXISTS/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("gives the reason, revision note and justification voice dictation", () => {
    const panel = code("components/incentive/incentive-decision-panel.tsx");
    const dialog = code("components/incentive/incentive-form-dialog.tsx");
    expect(panel).toMatch(/<NotesInput/);
    expect(dialog).toMatch(/export function NotesInput/);
    expect(dialog).toMatch(/useDictation/);
    expect(dialog).toMatch(/label=\{JUSTIFICATION_LABEL\}/);
  });
});
