import { describe, it, expect, vi, beforeEach } from "vitest";

// `lib/notifications/dispatch.ts` imports "server-only" at the top.  The
// real module throws when loaded outside an RSC; Vitest needs a no-op.
vi.mock("server-only", () => ({}));

/**
 * M4 — exercises the four-arm Promise.allSettled fan-out in
 * `dispatch.notify()`.  We mock the underlying DB layer + every channel
 * sender; the test asserts what gets stamped on `delivered_channels`
 * given different opt-in shapes and sender outcomes.
 */

const { insertSpy, returningSpy, updateSpy, whereSpy, setSpy, selectChain } =
  vi.hoisted(() => {
    const returningSpy = vi.fn();
    const insertSpy = vi.fn();
    const whereSpy = vi.fn(() => Promise.resolve());
    const setSpy = vi.fn(() => ({ where: whereSpy }));
    const updateSpy = vi.fn(() => ({ set: setSpy }));
    const selectChain = {
      prefs: null as unknown as Record<string, unknown> | null,
    };
    return { insertSpy, returningSpy, updateSpy, whereSpy, setSpy, selectChain };
  });

const {
  emailSpy,
  slackSpy,
  whatsappSpy,
  webPushSpy,
} = vi.hoisted(() => ({
  emailSpy: vi.fn<() => Promise<void>>(async () => undefined),
  slackSpy: vi.fn<() => Promise<"sent" | "skip" | { error: string }>>(
    async () => "skip",
  ),
  whatsappSpy: vi.fn<() => Promise<"sent" | "skip" | { error: string }>>(
    async () => "skip",
  ),
  webPushSpy: vi.fn<() => Promise<"sent" | "skip" | { error: string }>>(
    async () => "skip",
  ),
}));

vi.mock("@/lib/db", () => {
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

  // db.select().from(...).where(...).limit(1) -> [prefs] (or [])
  const limit = vi.fn(async () => (selectChain.prefs ? [selectChain.prefs] : []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
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
  employees: { id: "employees.id" },
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
    "overdue_digest",
  ],
}));

vi.mock("@/lib/email/resend", () => ({
  sendNotificationEmail: emailSpy,
}));
vi.mock("@/lib/slack/dispatch", () => ({ sendSlackDM: slackSpy }));
vi.mock("@/lib/whatsapp/dispatch", () => ({ sendWhatsApp: whatsappSpy }));
vi.mock("@/lib/web-push/client", () => ({ sendWebPushToUser: webPushSpy }));

// M5.1 — dispatch.notify() consults org_settings.notification_matrix.
// Empty object → resolveChannels falls back to all 4 channels allowed,
// which is what these stamping tests expect.
vi.mock("@/lib/queries/notification-matrix", () => ({
  getNotificationMatrix: vi.fn(async () => ({})),
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

import { notify } from "@/lib/notifications/dispatch";

function setPrefs(p: Partial<{
  id: string;
  name: string;
  email: string;
  emailOptIn: boolean;
  slackOptIn: boolean;
  slackUserId: string | null;
  whatsappOptedIn: boolean;
  whatsappPhone: string | null;
  whatsappTemplateLocale: string;
  mentionEscalation: boolean;
}>): void {
  selectChain.prefs = {
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
    ...p,
  };
}

function lastUpdatePatch(): Record<string, unknown> | null {
  const calls = setSpy.mock.calls as unknown as Array<
    [Record<string, unknown>]
  >;
  if (calls.length === 0) return null;
  const last = calls[calls.length - 1];
  return last ? last[0] : null;
}

beforeEach(() => {
  insertSpy.mockClear();
  updateSpy.mockClear();
  setSpy.mockClear();
  whereSpy.mockClear();
  emailSpy.mockClear();
  emailSpy.mockResolvedValue(undefined);
  slackSpy.mockClear();
  slackSpy.mockResolvedValue("skip");
  whatsappSpy.mockClear();
  whatsappSpy.mockResolvedValue("skip");
  webPushSpy.mockClear();
  webPushSpy.mockResolvedValue("skip");
  selectChain.prefs = null;
});

describe("notify() — delivered_channels stamping", () => {
  it("stamps ['email'] when only email is enabled and succeeds", async () => {
    setPrefs({ emailOptIn: true, slackOptIn: false, whatsappOptedIn: false });

    await notify({
      userId: "u-1",
      kind: "task_assigned",
      title: "Hello",
    });

    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(slackSpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
    // web push always runs — the function itself decides "skip" when no subs.
    expect(webPushSpy).toHaveBeenCalledTimes(1);

    const patch = lastUpdatePatch();
    expect(patch).not.toBeNull();
    expect(patch!.deliveredChannels).toEqual(["email"]);
    // Soft compatibility with M2.3 readers — emailSentAt also stamped.
    expect(patch!.emailSentAt).toBeInstanceOf(Date);
  });

  it("stamps all four when every channel succeeds", async () => {
    setPrefs({
      emailOptIn: true,
      slackOptIn: true,
      slackUserId: "U999",
      whatsappOptedIn: true,
      whatsappPhone: "+919820062511",
    });
    slackSpy.mockResolvedValue("sent");
    whatsappSpy.mockResolvedValue("sent");
    webPushSpy.mockResolvedValue("sent");

    await notify({
      userId: "u-1",
      kind: "task_assigned",
      title: "Hello",
    });

    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(slackSpy).toHaveBeenCalledTimes(1);
    expect(whatsappSpy).toHaveBeenCalledTimes(1);
    expect(webPushSpy).toHaveBeenCalledTimes(1);

    const patch = lastUpdatePatch();
    expect(patch!.deliveredChannels).toEqual([
      "email",
      "slack",
      "whatsapp",
      "web_push",
    ]);
  });

  it("stamps [] when every arm is opted out or skipped", async () => {
    setPrefs({
      emailOptIn: false,
      slackOptIn: false,
      whatsappOptedIn: false,
    });
    // web_push returns "skip" (no subs) by default.

    await notify({
      userId: "u-1",
      kind: "task_assigned",
      title: "Hello",
    });

    expect(emailSpy).not.toHaveBeenCalled();
    expect(slackSpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
    // Even though web_push is invoked, it returns "skip" -> not stamped.
    expect(webPushSpy).toHaveBeenCalledTimes(1);

    const patch = lastUpdatePatch();
    expect(patch!.deliveredChannels).toEqual([]);
    // No emailSentAt write when email didn't go out.
    expect(patch!.emailSentAt).toBeUndefined();
  });
});
