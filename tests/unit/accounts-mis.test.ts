import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MIS_TABS, misTabId } from "@/lib/accounts/mis";
import { ACCOUNTS_SECTIONS } from "@/lib/accounts/sections";
import { MisWorkspace } from "@/components/accounts/mis/mis-workspace";

describe("Accounts MIS", () => {
  it("contains the complete requested set of MIS tabs", () => {
    expect(MIS_TABS.map((tab) => tab.label)).toEqual([
      "Bank Balance Tracker", "Interpersonal Balance", "Cash Withdrawal", "Cash Limits", "Loans Tracker",
      "Credit Cards Master", "SIP Master", "Shares Master", "Mutual Funds Master", "FNO Tracker",
      "CA Handover", "Estimated PNL", "Last 3 Year BS",
    ]);
  });

  it("opens only known tab ids and defaults safely to Bank Balance Tracker", () => {
    expect(misTabId("shares")).toBe("shares");
    expect(misTabId("unknown")).toBe("bank-balance");
  });

  it("exposes MIS as a real Accounts section", () => {
    expect(ACCOUNTS_SECTIONS.find((section) => section.slug === "mis")).toMatchObject({
      title: "MIS",
      status: "built",
    });
  });

  it("renders all requested items as accessible MIS tabs", () => {
    const markup = renderToStaticMarkup(createElement(MisWorkspace, { activeTabId: "bank-balance" }));
    expect((markup.match(/role="tab"/g) ?? [])).toHaveLength(13);
    for (const tab of MIS_TABS) expect(markup).toContain(tab.label);
    expect(markup).toContain("Open Bank Balance Master");
  });
});
