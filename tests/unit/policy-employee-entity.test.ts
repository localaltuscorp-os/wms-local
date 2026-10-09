import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PolicyDocument } from "@/components/hr/policies/policy-document";
import { getPolicy, POLICY_LIST } from "@/lib/hr/policies/registry";
import { policyEntityIdForPayingEntityName } from "@/lib/hr/policies/policy-entity";
import { codeOf } from "../fixtures/source-code";

describe("employee policy company branding", () => {
  it("maps payroll companies to their canonical letterhead", () => {
    expect(policyEntityIdForPayingEntityName("Altus Corp")).toBe("altus-corp");
    expect(policyEntityIdForPayingEntityName("JSV HUF")).toBe("legacy-creators");
  });

  it("renders the complete policy with the employee's company letterhead and firm name", () => {
    const policy = getPolicy("posh-policy");
    expect(policy).toBeTruthy();

    const altus = renderToStaticMarkup(
      createElement(PolicyDocument, { doc: policy!, entity: "altus-corp" }),
    );
    const jsv = renderToStaticMarkup(
      createElement(PolicyDocument, { doc: policy!, entity: "legacy-creators" }),
    );

    expect(altus).toContain("/letterhead/header-altus-corp.jpg");
    expect(altus).toContain("Altus Corp is dedicated");
    expect(jsv).toContain("/letterhead/header-legacy-creators.jpg");
    expect(jsv).toContain("Legacy Creators (JSV HUF) is dedicated");
    expect(jsv).toContain("JSV HUF");
    expect(jsv).not.toContain("Altus Corp is dedicated");
    expect(jsv).not.toContain("{firm}");
  });

  it("uses the JSV letterhead and resolves firm tokens in every published policy", () => {
    for (const doc of POLICY_LIST) {
      const markup = renderToStaticMarkup(
        createElement(PolicyDocument, { doc, entity: "legacy-creators" }),
      );
      expect(markup).toContain("/letterhead/header-legacy-creators.jpg");
      expect(markup).not.toContain("{firm}");
      expect(markup).not.toContain("{firmLegal}");
    }
  });

  it("resolves the company on the server for viewing, signing, and downloads", () => {
    const page = codeOf("app/(app)/hr/policies/[key]/page.tsx");
    const view = codeOf("components/hr/policies/policy-view.tsx");
    const acknowledgement = codeOf("lib/hr/policies/acknowledge-core.ts");
    const singleDownload = codeOf("app/api/hr/policies/download/route.ts");
    const packetDownload = codeOf("app/api/hr/policies/download-all/route.ts");

    expect(page).toMatch(/policyEntityForEmployee\(me\)/);
    expect(view).not.toMatch(/Issuing Entity/);
    expect(view).not.toMatch(/setEntity/);
    expect(acknowledgement).toMatch(/policyEntityForEmployee\(me\)/);
    expect(acknowledgement).not.toMatch(/input\.entity/);
    expect(singleDownload).toMatch(/policyEntityForEmployee\(me\)/);
    expect(packetDownload).toMatch(/policyEntityForEmployee\(me\)/);
  });
});
