import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@react-email/render";

vi.mock("server-only", () => ({}));

// The service's database and dispatcher, faked: a recipient lookup, the
// delivery-ledger claim (unique on its four keys), and a release.
const fake = vi.hoisted(() => ({
  recipient: { isActive: true, employmentStatus: "active", name: "Recipient" } as Record<string, unknown> | null,
  claimed: new Set<string>(),
  lastClaim: null as string | null,
  released: 0,
  notify: vi.fn(async (_opts: unknown) => undefined),
}));

vi.mock("@/lib/db", () => {
  const select = () => ({
    from: () => ({
      where: () => ({ limit: async () => (fake.recipient ? [fake.recipient] : []) }),
    }),
  });
  const insert = () => ({
    values: (v: { eventType: string; subjectId: string; recipientId: string; versionKey: string }) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          const key = `${v.eventType}|${v.subjectId}|${v.recipientId}|${v.versionKey}`;
          if (fake.claimed.has(key)) return [];
          fake.claimed.add(key);
          fake.lastClaim = key;
          return [{ id: key }];
        },
      }),
    }),
  });
  const del = () => ({
    where: async () => {
      if (fake.lastClaim) fake.claimed.delete(fake.lastClaim);
      fake.released += 1;
    },
  });
  return { db: { select, insert, delete: del } };
});

vi.mock("@/lib/notifications/dispatch", () => ({ notify: fake.notify }));

import { INCENTIVE_STATUSES } from "@/db/enums";
import { NOTIFICATION_KINDS } from "@/db/schema";
import { DECISION_ACTIONS } from "@/lib/incentive/workflow";
import { categoryOfKind } from "@/lib/notifications/categories";
import { buildPushPayload } from "@/lib/web-push/payload";
import {
  DECISION_NOTIFICATION_KIND,
  INCENTIVE_NOTIFICATION_CHANNELS,
  INCENTIVE_NOTIFICATION_KINDS,
  incentiveNotificationHref,
  incentiveReference,
  incentiveRequestHref,
  parseIncentiveMeta,
  safeIncentiveHref,
  type IncentiveNotificationMeta,
} from "@/lib/incentive/notifications/kinds";
import {
  audienceGroupOf,
  diffCatalog,
  isEligibleFor,
  planCatalogNotifications,
  type AudienceEmployee,
  type CatalogSnapshot,
} from "@/lib/incentive/notifications/eligibility";
import {
  INCENTIVE_EMAIL_TEMPLATES,
  buildCatalogNotification,
  buildDecisionNotification,
  buildPaidNotification,
  buildResubmissionNotification,
  incentiveEmailContent,
} from "@/lib/incentive/notifications/content";
import { IncentiveNoticeEmail } from "@/emails/notifications/IncentiveNotice";
import {
  deliverIncentiveNotification,
  notifyIncentiveDecision,
  notifyIncentivePaid,
} from "@/lib/incentive/notifications/service";
import { parseBody } from "@/app/(app)/inbox/notification-row";

const ROOT = path.resolve(__dirname, "../..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const REQ = "3f2a9c1b-0d4e-4a5b-9c6d-7e8f9a0b1c2d";
const DECIDED = new Date("2026-09-15T08:30:00Z");

const salesDetails = {
  introducer_first_name: "Asha", introducer_last_name: "Rao", workshop: "Productivity Shastra",
  batch_no: "PS-1", prospect_first_name: "Ravi", prospect_last_name: "K", organisation: "Acme",
  cell: "9876543210", email: "ravi@acme.com", products: "BSS", opportunity_type: "BSS Potential",
  incentive_date: "2026-09-10",
};

const snap = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  name: "Key Note", description: "Deliver a keynote", amount: 500,
  salesEligible: false, internsEligible: true, notes: null, active: true, ...over,
});

const people: AudienceEmployee[] = [
  { id: "intern-1", isActive: true, employmentStatus: "active", designation: "Intern" },
  { id: "intern-off", isActive: false, employmentStatus: "active", designation: "Intern" },
  { id: "intern-former", isActive: true, employmentStatus: "former", designation: "Intern" },
  { id: "sales-1", isActive: true, employmentStatus: "active", designation: "Business Development Manager" },
  { id: "sales-2", isActive: true, employmentStatus: "active", designation: null },
  { id: "admin-actor", isActive: true, employmentStatus: "active", designation: "Operations Consultant" },
];

// ── Vocabulary ────────────────────────────────────────────────────────────────

describe("incentive notification kinds", () => {
  it("are registered notification kinds, filed under the Incentive inbox category", () => {
    for (const k of INCENTIVE_NOTIFICATION_KINDS) {
      expect(NOTIFICATION_KINDS).toContain(k);
      expect(categoryOfKind(k)).toBe("incentive");
    }
  });

  it("honour the recipient's own channel preferences (listed in the prefs matrix)", () => {
    const prefs = src("lib/profile/notification-prefs.ts");
    for (const k of INCENTIVE_NOTIFICATION_KINDS) expect(prefs).toContain(`"${k}"`);
  });

  it("every workflow decision has a notification", () => {
    for (const a of DECISION_ACTIONS) expect(INCENTIVE_NOTIFICATION_KINDS).toContain(DECISION_NOTIFICATION_KIND[a]);
    expect(DECISION_NOTIFICATION_KIND.not_approve).toBe("incentive_request_not_approved");
    expect(DECISION_NOTIFICATION_KIND.publish).toBe("incentive_request_published");
    expect(DECISION_NOTIFICATION_KIND.revise).toBe("incentive_request_revision");
  });

  it("use in-app + email + push only", () => {
    expect([...INCENTIVE_NOTIFICATION_CHANNELS]).toEqual(["email", "push"]);
  });
});

describe("notification links", () => {
  it("open the request itself", () => {
    expect(incentiveRequestHref(REQ)).toBe(`/incentive?request=${REQ}`);
    expect(incentiveRequestHref("not-a-uuid")).toBe("/incentive");
    expect(incentiveReference(REQ)).toBe("INC-3F2A9C1B");
  });

  it("never follow a tampered href off the incentive page", () => {
    for (const bad of ["https://evil.example", "javascript:alert(1)", "//evil.example", "/admin", "/incentive/../admin", "/incentive?x=<script>"]) {
      expect(safeIncentiveHref(bad)).toBe("/incentive");
    }
    const body = JSON.stringify({ v: 1, summary: "x", href: "javascript:alert(1)" });
    expect(incentiveNotificationHref("incentive_request_approved", body)).toBe("/incentive");
    expect(parseIncentiveMeta(body)?.href).toBe("/incentive");
  });

  it("are only resolved for incentive kinds", () => {
    expect(incentiveNotificationHref("task_assigned", JSON.stringify({ v: 1, summary: "x", href: "/incentive" }))).toBeNull();
    expect(parseIncentiveMeta('{"toStatus":"done"}')).toBeNull();
    expect(parseIncentiveMeta("free text")).toBeNull();
  });

  it("show the summary line in the Inbox, never the raw JSON", () => {
    const built = buildDecisionNotification({
      action: "approve", requestId: REQ, type: "sales_pitch", details: salesDetails, submissionNo: 1,
      newStatus: "approved", note: null, decidedAt: DECIDED, reviewerName: "Manan Vasa",
    })!;
    const parsed = parseBody(JSON.stringify(built.meta));
    expect(parsed).toEqual({ text: built.meta.summary });
  });

  it("push banners open the incentive page with the summary", () => {
    const p = buildPushPayload("incentive_request_approved", {
      actorName: "", taskSubject: "Incentive approved", body: "Sales Pitch approved", shortId: "", taskId: "",
      url: `/incentive?request=${REQ}`,
    });
    expect(p.url).toBe(`/incentive?request=${REQ}`);
    const task = buildPushPayload("task_assigned", { actorName: "A", taskSubject: "S", shortId: "1", taskId: "t1" });
    expect(task.url).toBe("/tasks/t1");
    expect(task.tag).toBe("task:t1");
  });
});

// ── Eligibility ───────────────────────────────────────────────────────────────

describe("who an Incentive Master change reaches", () => {
  it("classifies interns by designation and everyone else as sales", () => {
    expect(audienceGroupOf("Intern")).toBe("interns");
    expect(audienceGroupOf("Management Trainee")).toBe("interns");
    expect(audienceGroupOf("Assistant Vice President - Sales")).toBe("sales");
    expect(audienceGroupOf(null)).toBe("sales");
  });

  it("never includes inactive or former employees", () => {
    const s = snap({ salesEligible: true, internsEligible: true });
    expect(isEligibleFor(s, people[1]!)).toBe(false);
    expect(isEligibleFor(s, people[2]!)).toBe(false);
    expect(isEligibleFor(snap({ active: false }), people[0]!)).toBe(false);
  });

  it("new incentive → only eligible active employees, not the admin who added it", () => {
    const plan = planCatalogNotifications({ eventType: "created", before: null, after: snap(), employees: people, actorId: "admin-actor" });
    expect(plan.created).toEqual(["intern-1"]);
    const both = planCatalogNotifications({
      eventType: "created", before: null, after: snap({ salesEligible: true }), employees: people, actorId: "admin-actor",
    });
    expect(both.created.sort()).toEqual(["intern-1", "sales-1", "sales-2"]);
  });

  it("eligibility removed → removed notices; newly eligible → new-incentive notices; nobody else", () => {
    const plan = planCatalogNotifications({
      eventType: "updated", before: snap(), after: snap({ internsEligible: false, salesEligible: true }),
      employees: people, actorId: "admin-actor",
    });
    expect(plan.removed).toEqual(["intern-1"]);
    expect(plan.newlyEligible.sort()).toEqual(["sales-1", "sales-2"]);
    expect(plan.updated).toEqual([]);
  });

  it("material edit → the people still eligible; ineligible people hear nothing", () => {
    const plan = planCatalogNotifications({
      eventType: "updated", before: snap(), after: snap({ amount: 750 }), employees: people, actorId: null,
    });
    expect(plan.updated).toEqual(["intern-1"]);
    expect(plan.removed).toEqual([]);
    expect(plan.newlyEligible).toEqual([]);
    expect(diffCatalog(snap(), snap({ amount: 750 }))).toEqual([
      { field: "amount", label: "Amount", from: "₹500", to: "₹750" },
    ]);
  });

  it("an edit that changes nothing material notifies no one", () => {
    expect(diffCatalog(snap(), snap({ description: "Deliver a keynote  " }))).toEqual([]);
    const plan = planCatalogNotifications({ eventType: "updated", before: snap(), after: snap(), employees: people, actorId: null });
    expect(Object.values(plan).flat()).toEqual([]);
  });

  it("deleted → everyone who was eligible", () => {
    const plan = planCatalogNotifications({ eventType: "deleted", before: snap(), after: null, employees: people, actorId: null });
    expect(plan.deleted).toEqual(["intern-1"]);
  });
});

// ── Content ───────────────────────────────────────────────────────────────────

const decision = (action: (typeof DECISION_ACTIONS)[number], note: string | null, over: Record<string, unknown> = {}) =>
  buildDecisionNotification({
    action, requestId: REQ, type: "sales_pitch", details: salesDetails, submissionNo: 1,
    newStatus: "approved", note, decidedAt: DECIDED, reviewerName: "Manan Vasa", ...over,
  } as Parameters<typeof buildDecisionNotification>[0]);

describe("decision notifications", () => {
  it("are never built for Not Approved, Revise or Reversed without the reason", () => {
    expect(decision("not_approve", null)).toBeNull();
    expect(decision("not_approve", "   ")).toBeNull();
    expect(decision("revise", null)).toBeNull();
    expect(decision("reverse", "")).toBeNull();
  });

  it("Not Approved carries the reason verbatim, the request, and Justify & Resubmit", () => {
    const n = decision("not_approve", "Missing supporting information", { newStatus: "rejected" })!;
    expect(n.kind).toBe("incentive_request_not_approved");
    expect(n.title).toContain("Incentive not approved");
    expect(n.title).toContain("INC-3F2A9C1B");
    expect(n.meta.note).toBe("Missing supporting information");
    expect(n.meta.summary).toContain("Missing supporting information");
    expect(n.meta.href).toBe(`/incentive?request=${REQ}`);
    const email = incentiveEmailContent(n.kind, n.meta)!;
    expect(email.quote).toEqual({ label: "Reason for rejection", text: "Missing supporting information" });
    expect(email.cta).toEqual({ label: "Justify & Resubmit", path: `/incentive?request=${REQ}` });
    const labels = email.details.map((d) => d.label);
    expect(labels).toEqual(expect.arrayContaining(["Reference", "Incentive", "Incentive date", "Amount", "Status", "Decided on"]));
  });

  it("Approved shows the approved amount, status and approval date", () => {
    const n = decision("approve", null)!;
    const email = incentiveEmailContent(n.kind, n.meta)!;
    const row = (l: string) => email.details.find((d) => d.label === l)?.value;
    expect(row("Approved amount")).toBe("₹250");
    expect(row("Status")).toBe("Approved");
    expect(row("Approval date")).toMatch(/15-Sep-2026/);
  });

  it("Publish, Revise, Due, Not Due and Reversed use the matching notice", () => {
    expect(decision("publish", null)!.kind).toBe("incentive_request_published");
    const rev = decision("revise", "Please add the client's consent screenshot", { newStatus: "revision_requested" })!;
    expect(incentiveEmailContent(rev.kind, rev.meta)!.quote?.text).toBe("Please add the client's consent screenshot");
    expect(decision("due", null, { newStatus: "due" })!.kind).toBe("incentive_request_due");
    const notDue = decision("not_due", null, { newStatus: "not_due" })!;
    expect(notDue.kind).toBe("incentive_request_not_due");
    expect(incentiveEmailContent(notDue.kind, notDue.meta)).toBeNull(); // in-app only
    const reversed = decision("reverse", "Client cancelled", { newStatus: "reversed" })!;
    expect(incentiveEmailContent(reversed.kind, reversed.meta)!.quote).toEqual({ label: "Reversal reason", text: "Client cancelled" });
  });

  it("a stored Not Approved notice without its reason renders no email", () => {
    const meta: IncentiveNotificationMeta = { v: 1, summary: "x", href: "/incentive" };
    expect(incentiveEmailContent("incentive_request_not_approved", meta)).toBeNull();
    expect(incentiveEmailContent("incentive_request_reversed", meta)).toBeNull();
    expect(incentiveEmailContent("incentive_request_revision", meta)).toBeNull();
  });
});

describe("resubmission, catalog and payment notices", () => {
  it("resubmission tells the reviewer who, what, when and why", () => {
    const n = buildResubmissionNotification({
      requestId: REQ, type: "sales_pitch", details: salesDetails, submissionNo: 2,
      justification: "Added the requested documentation. ".repeat(20), submittedAt: DECIDED, employeeName: "Asha Rao",
    });
    expect(n.kind).toBe("incentive_request_resubmitted");
    expect(n.meta.summary.startsWith("An incentive request has been resubmitted.")).toBe(true);
    expect(n.meta.employeeName).toBe("Asha Rao");
    expect(n.meta.justification!.length).toBeLessThanOrEqual(280);
    expect(n.meta.href).toBe(`/incentive?request=${REQ}`);
    const email = incentiveEmailContent(n.kind, n.meta)!;
    expect(email.details[0]).toEqual({ label: "Employee", value: "Asha Rao" });
    expect(email.details.map((d) => d.label)).toContain("Resubmitted on");
    expect(email.cta.label).toBe("Review the request");
  });

  it("eligibility removed states the effective date from the change record", () => {
    const n = buildCatalogNotification({ kind: "incentive_eligibility_removed", snapshot: snap(), effectiveDate: "2026-08-03", changes: [] });
    expect(n.meta.summary).toBe("You are no longer eligible for this incentive with effect from 03-Aug-2026.");
    expect(incentiveEmailContent(n.kind, n.meta)!.headline).toBe(
      "You are no longer eligible for this incentive with effect from 03-Aug-2026.",
    );
  });

  it("new, updated and deleted incentives point at the Incentive Table", () => {
    const created = buildCatalogNotification({ kind: "incentive_created", snapshot: snap(), effectiveDate: "2026-09-15", changes: [] });
    expect(created.meta).toMatchObject({ incentiveName: "Key Note", amount: 500, eligibleGroups: "Interns", effectiveDate: "2026-09-15", href: "/incentive?view=table" });
    const updated = buildCatalogNotification({
      kind: "incentive_updated", snapshot: snap({ amount: 750 }), effectiveDate: "2026-09-15",
      changes: diffCatalog(snap(), snap({ amount: 750 })),
    });
    expect(updated.meta.summary).toContain("Please check the Incentive Table for the latest details.");
    expect(incentiveEmailContent(updated.kind, updated.meta)!.changes).toEqual([{ label: "Amount", from: "₹500", to: "₹750" }]);
    const deleted = buildCatalogNotification({ kind: "incentive_deleted", snapshot: snap(), effectiveDate: "2026-09-15", changes: [] });
    expect(incentiveEmailContent(deleted.kind, deleted.meta)!.headline).toBe("Key Note is no longer available.");
  });

  it("paid names the incentive, amount and date", () => {
    const n = buildPaidNotification({ label: "Consulting Pitch", amount: 250, paidDate: "2026-09-30", periodMonth: "2026-09-01" });
    const email = incentiveEmailContent(n.kind, n.meta)!;
    expect(email.details).toEqual([
      { label: "Incentive", value: "Consulting Pitch" },
      { label: "Amount paid", value: "₹250" },
      { label: "Paid on", value: "30-Sep-2026" },
      { label: "For", value: "Sep 2026" },
    ]);
  });

  it("there are exactly the twelve email templates asked for", () => {
    expect(Object.keys(INCENTIVE_EMAIL_TEMPLATES).sort()).toEqual(
      [
        "incentive_created", "incentive_eligibility_removed", "incentive_updated", "incentive_deleted",
        "incentive_request_not_approved", "incentive_request_approved", "incentive_request_due", "incentive_paid",
        "incentive_request_resubmitted", "incentive_request_reversed", "incentive_request_revision",
        "incentive_request_published",
      ].sort(),
    );
    expect(INCENTIVE_STATUSES).toContain("revision_requested");
  });
});

describe("the email itself", () => {
  it("renders the reason escaped, the details and a working link", async () => {
    const n = decision("not_approve", "Missing <b>supporting</b> information", { newStatus: "rejected" })!;
    const html = await render(
      IncentiveNoticeEmail({ ...incentiveEmailContent(n.kind, n.meta)!, recipientName: "Asha", siteUrl: "https://wms.example/" }),
    );
    expect(html).toContain("Hi <!-- -->Asha");
    expect(html).toContain("Missing &lt;b&gt;supporting&lt;/b&gt; information");
    expect(html).not.toContain("<b>supporting</b>");
    expect(html).toContain(`href="https://wms.example/incentive?request=${REQ}"`);
    expect(html).toContain("Justify &amp; Resubmit");
    expect(html).toContain("INC-3F2A9C1B");
    expect(html).toContain("₹250");
  });
});

// ── Delivery: recipients, duplicates, failures ───────────────────────────────

describe("delivery", () => {
  beforeEach(() => {
    fake.recipient = { isActive: true, employmentStatus: "active", name: "Recipient" };
    fake.claimed.clear();
    fake.lastClaim = null;
    fake.released = 0;
    fake.notify.mockReset();
    fake.notify.mockImplementation(async () => undefined);
  });

  const item = () => ({
    built: decision("approve", null)!,
    recipientId: "emp-1",
    subjectId: REQ,
    versionKey: "decision:d1",
    actorId: "manan",
  });

  it("sends one individual notification with the incentive channels and meta", async () => {
    expect(await deliverIncentiveNotification(item())).toBe("sent");
    expect(fake.notify).toHaveBeenCalledTimes(1);
    const opts = fake.notify.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.userId).toBe("emp-1");
    expect(opts.kind).toBe("incentive_request_approved");
    expect(opts.channels).toEqual(["email", "push"]);
    expect(parseIncentiveMeta(opts.body as string)?.requestId).toBe(REQ);
  });

  it("the same event processed again sends nothing", async () => {
    expect(await deliverIncentiveNotification(item())).toBe("sent");
    expect(await deliverIncentiveNotification(item())).toBe("duplicate");
    expect(await deliverIncentiveNotification(item())).toBe("duplicate");
    expect(fake.notify).toHaveBeenCalledTimes(1);
    // A different event for the same request is not a duplicate.
    expect(await deliverIncentiveNotification({ ...item(), versionKey: "decision:d2" })).toBe("sent");
  });

  it("inactive and former employees receive nothing", async () => {
    fake.recipient = { isActive: false, employmentStatus: "active" };
    expect(await deliverIncentiveNotification(item())).toBe("inactive");
    fake.recipient = { isActive: true, employmentStatus: "former" };
    expect(await deliverIncentiveNotification(item())).toBe("inactive");
    fake.recipient = null;
    expect(await deliverIncentiveNotification(item())).toBe("inactive");
    expect(fake.notify).not.toHaveBeenCalled();
  });

  it("a failed delivery never throws, and can be retried", async () => {
    fake.notify.mockImplementationOnce(async () => {
      throw new Error("provider down");
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deliverIncentiveNotification(item())).resolves.toBe("failed");
    expect(fake.released).toBe(1);
    expect(errors).toHaveBeenCalled();
    await expect(deliverIncentiveNotification(item())).resolves.toBe("sent");
    errors.mockRestore();
  });

  it("a Not Approved decision without a reason is not notified at all", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await notifyIncentiveDecision({
      requestId: REQ, employeeId: "emp-1", type: "sales_pitch", details: salesDetails, submissionNo: 1,
      action: "not_approve", newStatus: "rejected", note: null, decisionId: "d9", decidedAt: DECIDED, reviewerId: "manan",
    });
    expect(res).toBe("skipped");
    expect(fake.notify).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("a payment with no linked employee or no amount has no one to tell", async () => {
    const base = { subjectId: REQ, versionKey: "payout-event:1", label: "X", paidDate: null, periodMonth: null, actorId: null };
    expect(await notifyIncentivePaid({ ...base, employeeId: null, amount: 100 })).toBe("skipped");
    expect(await notifyIncentivePaid({ ...base, employeeId: "emp-1", amount: 0 })).toBe("skipped");
    expect(await notifyIncentivePaid({ ...base, employeeId: "emp-1", amount: 100 })).toBe("sent");
  });
});

// ── Integration points & boundaries ──────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

describe("integration points", () => {
  it("decisions and resubmissions notify only after their write, never inline email", () => {
    const actions = src("app/(app)/incentive/actions.ts");
    expect(actions).not.toMatch(/sendIncentiveDecisionEmail/);
    expect(actions.indexOf("afterResponse(() => notifyIncentiveDecision(")).toBeGreaterThan(
      actions.indexOf("recordIncentiveDecision({"),
    );
    expect(actions.indexOf("afterResponse(() => notifyIncentiveResubmitted(")).toBeGreaterThan(
      actions.indexOf("resubmitIncentive({"),
    );
  });

  it("Incentive Master changes record their event in the same transaction", () => {
    const catalog = src("app/(app)/incentive/catalog-actions.ts");
    expect(catalog.match(/recordIncentiveCatalogEvent\(tx,/g)?.length).toBe(3); // created, updated, deleted
    expect(catalog).toMatch(/afterResponse\(\(\) => processIncentiveCatalogEvent\(eventId\)\)/);
    // Deleting the master row deletes nothing else.
    expect(catalog.match(/\.delete\(/g)?.length).toBe(1);
    expect(catalog).toMatch(/tx\.delete\(incentiveCatalog\)/);
  });

  it("paid notices hang off the existing Accounts writes without changing them", () => {
    const payout = src("app/(app)/salary/incentive-payout/actions.ts");
    expect(payout.indexOf("afterResponse(() => notifyIncentivesPaid(")).toBeGreaterThan(payout.indexOf("db.transaction("));
    expect(payout).toMatch(/versionKey: `payout-event:\$\{audit\.id\}`/);
    const status = src("app/(app)/incentive/status-actions.ts");
    expect(status.match(/notifyIfPaidIncreased\(\{/g)?.length).toBe(3); // entry + project leg + split
  });

  it("the notification service is server-only and not a server action", () => {
    const service = src("lib/incentive/notifications/service.ts");
    expect(service.startsWith('import "server-only";')).toBe(true);
    expect(service).not.toMatch(/["']use server["']/);
  });

  it("no client component can reach the notification service", () => {
    const offenders = [...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "app"))].filter((f) => {
      const text = readFileSync(f, "utf8");
      return /^\s*["']use client["']/.test(text) && /incentive\/notifications\/service/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("incentive emails go through the shared sender, which reports provider failures", () => {
    const resend = src("lib/email/resend.ts");
    const sender = resend.slice(resend.indexOf("export async function sendNotificationEmail"), resend.indexOf("export async function sendDigestEmail"));
    expect(sender).toMatch(/const \{ error \} = await resend\.emails\.send\(/);
    expect(sender).toMatch(/if \(error\) throw new Error/);
    expect(resend).toMatch(/isIncentiveNotificationKind\(ctx\.notification\.kind\)/);
  });

  it("dispatch narrows incentive notifications to their channels on top of the admin matrix", () => {
    const dispatch = src("lib/notifications/dispatch.ts");
    expect(dispatch).toMatch(/narrowTo \? matrixChannels\.filter\(\(c\) => narrowTo\.has\(c\)\) : matrixChannels/);
  });

  it("a user can only read or mark their own notifications", () => {
    const q = src("lib/queries/notifications.ts");
    expect(q).toMatch(/eq\(notifications\.userId, args\.userId\)/);
    const markRead = q.slice(q.indexOf("export async function markRead"));
    expect(markRead.slice(0, 600)).toMatch(/eq\(notifications\.userId, userId\)/);
  });

  it("a notification link only opens a request already in the viewer's own list", () => {
    const page = src("app/(app)/incentive/page.tsx");
    expect(page).toMatch(/rows\.some\(\(row\) => row\.id === requestedId\)/);
  });
});
