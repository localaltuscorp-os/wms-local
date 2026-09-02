import { describe, it, expect } from "vitest";
import { getVisibleDashboards, EXTERNAL_DASHBOARDS } from "@/lib/external-dashboards";
import type { Employee } from "@/db/schema";

// Minimal Employee factory — only the fields the predicate reads.
// Casting through `unknown` keeps us from having to spell out every nullable
// column on the schema for a test that exercises 2 booleans + 1 string.
function fakeEmployee(over: Partial<Employee>): Employee {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Test",
    email: "noone@example.com",
    role: "doer",
    avatarUrl: null,
    department: null,
    departmentId: null,
    createdAt: new Date(),
    firebaseUid: null,
    isAdmin: false,
    isActive: true,
    invitedAt: null,
    joinedAt: null,
    lastInboxVisitAt: new Date(),
    slackUserId: null,
    emailOptIn: true,
    slackOptIn: true,
    whatsappPhone: null,
    whatsappOptedIn: false,
    whatsappTemplateLocale: "en",
    ...over,
  } as unknown as Employee;
}

const ALL_IDS = ["leads", "liasoning", "mandate-collection"] as const;

describe("EXTERNAL_DASHBOARDS", () => {
  it("declares exactly three dashboards in stable order", () => {
    expect(EXTERNAL_DASHBOARDS.map((d) => d.id)).toEqual(ALL_IDS);
  });

  it("every dashboard has a non-empty URL and accent token", () => {
    for (const d of EXTERNAL_DASHBOARDS) {
      expect(d.url).toMatch(/^https:\/\/script\.google\.com\//);
      expect(["blue", "amber", "purple"]).toContain(d.accent);
    }
  });
});

describe("getVisibleDashboards", () => {
  it("returns empty array for null employee", () => {
    expect(getVisibleDashboards(null)).toEqual([]);
  });

  it("non-admin, non-special email sees no Reports dashboards", () => {
    const me = fakeEmployee({ email: "shilpa@vpinnacle.com", isAdmin: false });
    const ids = getVisibleDashboards(me).map((d) => d.id);
    expect(ids).toEqual([]);
  });

  it("non-admin user with altus@vpinnacle.com sees all three", () => {
    const me = fakeEmployee({ email: "altus@vpinnacle.com", isAdmin: false });
    const ids = getVisibleDashboards(me).map((d) => d.id);
    expect(ids).toEqual(ALL_IDS);
  });

  it("non-admin user with pravin@vpinnacle.com sees all three (case-insensitive)", () => {
    const me = fakeEmployee({ email: "Pravin@VPinnacle.com", isAdmin: false });
    const ids = getVisibleDashboards(me).map((d) => d.id);
    expect(ids).toEqual(ALL_IDS);
  });

  it("admin with an unrelated email still sees all three", () => {
    const me = fakeEmployee({ email: "hetesh@altuscorp.in", isAdmin: true });
    const ids = getVisibleDashboards(me).map((d) => d.id);
    expect(ids).toEqual(ALL_IDS);
  });

  it("trims surrounding whitespace before comparing emails", () => {
    const me = fakeEmployee({ email: "  altus@vpinnacle.com  ", isAdmin: false });
    expect(getVisibleDashboards(me)).toHaveLength(3);
  });
});
