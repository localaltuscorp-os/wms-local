import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("incentive entry consolidation", () => {
  it("keeps only Requests as the active incentive entry tab", () => {
    const tabs = read("components/incentive/incentive-tabs.tsx");
    const nav = read("components/layout/main-nav.tsx");
    expect(tabs).toMatch(/IncentiveEntries/);
    expect(tabs).toMatch(/\["entries"\]/);
    expect(nav).not.toMatch(/label: "Entries".*tab: "entries"/);
    const ledger = read("components/incentive/incentive-entries.tsx");
    expect(ledger).not.toMatch(/Add entry/);
    expect(ledger).not.toMatch(/IncentiveImportDialog/);
    expect(read("app/api/templates/[key]/route.ts")).toMatch(/TEMPLATE_KEYS\.incentiveEntries/);
  });

  it("rejects legacy direct creation and entry imports server-side", () => {
    const actions = read("app/(app)/incentive/admin-actions.ts");
    expect(actions).toMatch(/Direct incentive entry creation is retired/);
    expect(actions).toMatch(/Incentive Entries upload is retired/);
  });

  it("links one finalized request to one ledger entry", () => {
    const schema = read("db/schema.ts");
    const migration = read("db/migrations/0269_incentive_request_ledger.sql");
    const workflow = read("lib/incentive/workflow-server.ts");
    expect(schema).toMatch(/incentiveRequestId: uuid\("incentive_request_id"\)/);
    expect(schema).toMatch(/uniqueIndex\("incentive_entries_request_uq"\)/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS incentive_entries_request_uq/);
    expect(workflow).toMatch(/finalizeApprovedIncentiveRequest/);
  });
});
