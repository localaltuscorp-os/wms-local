import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "app", "(app)", "billing");

function billingPages(dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return billingPages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const headerSources = [
  "app/(app)/billing/ambassadors/page.tsx",
  "app/(app)/billing/ambassadors/commissions/page.tsx",
  "app/(app)/billing/ambassadors/directory/page.tsx",
  "app/(app)/billing/ambassadors/new/page.tsx",
  "app/(app)/billing/ambassadors/pipeline/page.tsx",
  "app/(app)/billing/ambassadors/[id]/page.tsx",
  "app/(app)/billing/ambassadors/[id]/edit/page.tsx",
  "app/(app)/billing/contracts/page.tsx",
  "app/(app)/billing/contracts/[id]/page.tsx",
  "app/(app)/billing/customers/addresses/page.tsx",
  "app/(app)/billing/documents/page.tsx",
  "app/(app)/billing/documents/[id]/page.tsx",
  "app/(app)/billing/documents/[id]/edit/page.tsx",
  "app/(app)/billing/documents/[id]/email/page.tsx",
  "app/(app)/billing/outstanding/page.tsx",
  "app/(app)/billing/outstanding/contracts/page.tsx",
  "app/(app)/billing/recycle-bin/page.tsx",
  "components/billing/contract-form.tsx",
  "components/billing/customer-kyc-form.tsx",
  "components/billing/customer-master-view.tsx",
  "components/billing/customer-record.tsx",
  "components/billing/doc-type-title.tsx",
  "components/billing/dropdown-master-view.tsx",
];

describe("Billing header consistency", () => {
  it("audits every user-facing Billing route", () => {
    expect(billingPages()).toHaveLength(25);
  });

  it("uses the shared Training title typography for every Billing page header source", () => {
    for (const path of headerSources) {
      expect(source(path), path).toContain("PAGE_COMMAND_BAR_TITLE_STYLE");
    }
  });

  it("does not retain the removed Billing or Ambassador header labels", () => {
    const headers = headerSources.map(source).join("\n");
    expect(headers).not.toMatch(/>Billing<|>Ambassadors<|Customer KYC · Configuration/);
  });
});
