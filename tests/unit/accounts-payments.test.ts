import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentsWorkspace } from "@/components/accounts/payments/payments-workspace";
import { PAYMENT_TABS, paymentTabId } from "@/lib/accounts/payments";
import { ACCOUNTS_SECTIONS } from "@/lib/accounts/sections";

describe("Accounts Payments", () => {
  it("contains the five requested payment subsections", () => {
    expect(PAYMENT_TABS.map((tab) => tab.label)).toEqual([
      "Reimbursements", "Incentives", "Salary", "Overtime", "Company Expenses",
    ]);
  });

  it("opens only known tabs and defaults safely to Reimbursements", () => {
    expect(paymentTabId("salary")).toBe("salary");
    expect(paymentTabId("unknown")).toBe("reimbursements");
  });

  it("exposes Payments as a real Accounts section", () => {
    expect(ACCOUNTS_SECTIONS.find((section) => section.slug === "payments")).toMatchObject({
      title: "Payments",
      status: "built",
    });
  });

  it("renders all requested items as accessible tabs", () => {
    const markup = renderToStaticMarkup(createElement(PaymentsWorkspace, { activeTabId: "reimbursements" }));
    expect((markup.match(/role="tab"/g) ?? [])).toHaveLength(5);
    for (const tab of PAYMENT_TABS) expect(markup).toContain(tab.label);
    expect(markup).toContain("Open Reimbursements");
  });
});
