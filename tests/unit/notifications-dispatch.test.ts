import { describe, it, expect, vi, beforeEach } from "vitest";

// `lib/notifications/dispatch.ts` imports "server-only" at the top.  The
// real module throws when loaded outside an RSC; Vitest needs a no-op.
vi.mock("server-only", () => ({}));

// vi.hoisted lets the mock factories below reference the spies.
const { insertSpy, returningSpy, updateSpy, emailSpy } = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  returningSpy: vi.fn(),
  updateSpy: vi.fn(),
  emailSpy: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => {
  // insert(...).values(...).returning(...) — final returning() yields a single row.
  returningSpy.mockImplementation(async () =>
    Promise.resolve([
      {
        id: "notif-1",
        userId: "u-1",
        taskId: "t-1",
        kind: "task_assigned",
        title: "title",
        body: null,
      },
    ]),
  );
  const values = vi.fn(() => ({ returning: returningSpy }));
  insertSpy.mockImplementation(() => ({ values }));

  // update(...).set(...).where(...) — chain resolves to undefined.
  const where = vi.fn(() => Promise.resolve());
  updateSpy.mockImplementation(() => ({ set: vi.fn(() => ({ where })) }));

  // M4 — `notify()` now reads recipient prefs via db.select().from()
  // .where().limit().  Return a minimal RecipientChannelPrefs row so
  // the email arm fires (matches the legacy "email always tried" shape
  // these tests were originally written for).
  const limit = vi.fn(async () => [
    {
      id: "u-1",
      name: "Recipient",
      email: "recipient@example.com",
      emailOptIn: true,
      slackOptIn: false,
      slackUserId: null,
      whatsappOptedIn: false,
      whatsappPhone: null,
      whatsappTemplateLocale: "en",
      mentionEscalation: true,
    },
  ]);
  const selWhere = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where: selWhere }));
  const select = vi.fn(() => ({ from }));

  return {
    db: {
      insert: insertSpy,
      update: updateSpy,
      select,
      query: {
        tasks: { findFirst: vi.fn(async () => undefined) },
        employees: { findFirst: vi.fn(async () => undefined) },
      },
    },
  };
});

vi.mock("@/db/schema", () => ({
  notifications: { id: "notifications.id" },
  tasks: { id: "tasks.id" },
  employees: {
    id: "employees.id",
    name: "employees.name",
    email: "employees.email",
    emailOptIn: "employees.emailOptIn",
    slackOptIn: "employees.slackOptIn",
    slackUserId: "employees.slackUserId",
    whatsappOptedIn: "employees.whatsappOptedIn",
    whatsappPhone: "employees.whatsappPhone",
    whatsappTemplateLocale: "employees.whatsappTemplateLocale",
  },
  NOTIFICATION_KINDS: [
    "task_assigned",
    "task_initiated",
    "status_changed",
    "approved",
    "declined",
    "reassigned",
    "transferred",
    "cancelled",
    "commented",
    "nudged",
    "overdue_digest",
  ],
}));

vi.mock("@/lib/email/resend", () => ({
  sendNotificationEmail: emailSpy,
}));

// M5.1 — dispatch.notify() now reads org_settings.notification_matrix
// via this helper. Empty object means "all 4 channels allowed for every
// kind" (resolveChannels handles the fallback), which keeps these legacy
// tests' "email always tried" expectations.
vi.mock("@/lib/queries/notification-matrix", () => ({
  getNotificationMatrix: vi.fn(async () => ({})),
}));

// M4 — stub the three new channel modules so they're no-ops in
// the legacy "inserts + email" tests below.  These return "skip" so
// `delivered_channels` ends up with just `["email"]` when email fires.
vi.mock("@/lib/slack/dispatch", () => ({
  sendSlackDM: vi.fn(async () => "skip" as const),
}));
vi.mock("@/lib/whatsapp/dispatch", () => ({
  sendWhatsApp: vi.fn(async () => "skip" as const),
}));
vi.mock("@/lib/web-push/client", () => ({
  sendWebPushToUser: vi.fn(async () => "skip" as const),
}));

// Profile v2 — bypass unstable_cache so tests don't need Next's
// incremental-cache context.
vi.mock("@/lib/profile/notification-prefs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/profile/notification-prefs")
  >("@/lib/profile/notification-prefs");
  return {
    ...actual,
    getNotificationPrefs: vi.fn(async () => ({})),
  };
});

import { notify, dedupeRecipients } from "@/lib/notifications/dispatch";

beforeEach(() => {
  insertSpy.mockClear();
  updateSpy.mockClear();
  emailSpy.mockClear();
});

describe("dedupeRecipients", () => {
  it("removes duplicates, null/undefined, and the actor", () => {
    const out = dedupeRecipients(
      ["a", "b", "a", null, undefined, "actor"],
      "actor",
    );
    expect(out).toEqual(["a", "b"]);
  });

  it("returns an empty array when only the actor is given", () => {
    expect(dedupeRecipients(["actor", "actor"], "actor")).toEqual([]);
  });
});

describe("notify", () => {
  it("inserts a row and fires the email", async () => {
    await notify({
      userId: "u-1",
      kind: "task_assigned",
      title: "Hello",
      taskId: "t-1",
      actorId: "actor",
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(emailSpy).toHaveBeenCalledTimes(1);
  });

  it("swallows email failures without re-throwing", async () => {
    emailSpy.mockRejectedValueOnce(new Error("resend offline"));
    await expect(
      notify({
        userId: "u-1",
        kind: "task_assigned",
        title: "Hello",
      }),
    ).resolves.toBeUndefined();
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
