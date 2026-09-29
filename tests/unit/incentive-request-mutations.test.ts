import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(file, "utf8");

describe("incentive request mutation guards", () => {
  it("keeps normal changes to pending, never-decided requests", () => {
    const actions = src("app/(app)/incentive/actions.ts");
    const workflow = src("lib/incentive/workflow-server.ts");
    expect(actions).toMatch(/row\.employeeId !== me\.id && !me\.isAdmin/);
    expect(actions).toMatch(/row\.status !== "pending"/);
    expect(actions).toMatch(/incentiveRequestDecisions/);
    expect(workflow).toMatch(/amendPendingIncentive/);
    expect(workflow).toMatch(/PENDING_REQUEST_EDIT_NOTE/);
  });

  it("keeps the submission audit append-only and protects decisions from delete", () => {
    const workflow = src("lib/incentive/workflow-server.ts");
    const actions = src("app/(app)/incentive/actions.ts");
    expect(workflow).toMatch(/insert\(incentiveRequestSubmissions\)/);
    expect(actions).toMatch(/A decided request cannot be deleted/);
    expect(actions).toMatch(/eq\(incentiveRequests\.status, "pending"\)/);
  });

  it("removes the Status tab after relocating entry payment and split controls", () => {
    expect(existsSync("app/(app)/incentive/status-actions.ts")).toBe(false);
    expect(existsSync("components/incentive/incentive-status-tab.tsx")).toBe(false);
    const tabs = src("components/incentive/incentive-tabs.tsx");
    const entries = src("components/incentive/incentive-entries.tsx");
    expect(tabs).not.toMatch(/"status"/);
    expect(entries).toMatch(/IncentiveEntrySplitDialog/);
    expect(entries).toMatch(/Booked Amount/);
  });
});
