import { describe, it, expect } from "vitest";
import {
  FUNCTION_LABELS,
  FUNCTION_VIEWS,
  functionOfDepartment,
  functionsOf,
  inFunctionView,
  type FunctionView,
} from "@/lib/org/functions";

/**
 * The function list is a claim about the org that lives in code, so the claims
 * are pinned here — most of all the ones a careless regex gets wrong.
 */
describe("functionOfDepartment", () => {
  it("maps each of the eight functions from its real department name", () => {
    expect(functionOfDepartment("Sales")).toBe("sales");
    expect(functionOfDepartment("Marketing")).toBe("marketing");
    expect(functionOfDepartment("Operations")).toBe("operations");
    expect(functionOfDepartment("Handholding")).toBe("handholding");
    expect(functionOfDepartment("HR")).toBe("hr");
    expect(functionOfDepartment("Admin")).toBe("admin");
    expect(functionOfDepartment("Accounts")).toBe("accounts");
    expect(functionOfDepartment("Apps")).toBe("apps");
  });

  it("matches the App variants that actually exist, not just 'Apps'", () => {
    for (const name of ["Apps", "App Devp", "BSS App"]) {
      expect(functionOfDepartment(name)).toBe("apps");
    }
  });

  it("matches Operations spelled out — a plain 'ops' substring never would", () => {
    // o-p-e-r-a-t-i-o-n-s contains no "ops".
    expect("Operations".includes("ops")).toBe(false);
    expect(functionOfDepartment("Operations")).toBe("operations");
    expect(functionOfDepartment("Ops")).toBe("operations");
  });

  it("still matches the pre-0023 'Hand Holding' spelling", () => {
    expect(functionOfDepartment("Hand Holding")).toBe("handholding");
    expect(functionOfDepartment("Handholding")).toBe("handholding");
  });

  it("does not let a bare 'hr' inside a longer word claim the HR tab", () => {
    expect(functionOfDepartment("Throughput")).toBeNull();
    expect(functionOfDepartment("HR")).toBe("hr");
    expect(functionOfDepartment("Human Resources")).toBe("hr");
  });

  it("is case-insensitive, since the names are free text", () => {
    expect(functionOfDepartment("sales")).toBe("sales");
    expect(functionOfDepartment("ACCOUNTS")).toBe("accounts");
  });

  it("returns null for the departments deliberately left out", () => {
    for (const name of ["Founder", "Founder Office", "Social Media", "Consulting", "CRM"]) {
      expect(functionOfDepartment(name)).toBeNull();
    }
  });

  it("gives Sales precedence over Admin for a compound name", () => {
    expect(functionOfDepartment("Sales Admin")).toBe("sales");
  });
});

describe("functionsOf", () => {
  it("returns every function a multi-department person holds", () => {
    expect(functionsOf(["Apps", "HR"]).sort()).toEqual(["apps", "hr"]);
  });

  it("accepts the legacy single-string department shape", () => {
    expect(functionsOf("Sales")).toEqual(["sales"]);
  });

  it("is empty for no department, and for one outside the eight", () => {
    expect(functionsOf(null)).toEqual([]);
    expect(functionsOf([])).toEqual([]);
    expect(functionsOf("Founder")).toEqual([]);
  });

  it("de-duplicates two departments landing in one function", () => {
    expect(functionsOf(["Apps", "App Devp"])).toEqual(["apps"]);
  });
});

describe("inFunctionView", () => {
  it("puts everyone under All", () => {
    expect(inFunctionView(null, "all")).toBe(true);
    expect(inFunctionView("Founder", "all")).toBe(true);
  });

  it("counts a multi-department person under EACH function they hold", () => {
    expect(inFunctionView(["Apps", "HR"], "apps")).toBe(true);
    expect(inFunctionView(["Apps", "HR"], "hr")).toBe(true);
    expect(inFunctionView(["Apps", "HR"], "others")).toBe(false);
  });

  it("sends an unmatched department, and no department at all, to Others", () => {
    expect(inFunctionView("Social Media", "others")).toBe(true);
    expect(inFunctionView(null, "others")).toBe(true);
    expect(inFunctionView([], "others")).toBe(true);
  });

  it("makes Others the exact complement, so the tabs partition the roster", () => {
    const roster = [
      ["Sales"],
      ["Marketing"],
      ["Operations"],
      ["Handholding"],
      ["HR"],
      ["Admin"],
      ["Accounts"],
      ["App Devp"],
      ["Founder"],
      ["Social Media"],
      [],
    ];
    const named = FUNCTION_VIEWS.filter((v) => v !== "all" && v !== "others");
    for (const person of roster) {
      const inAnyNamed = named.some((v) => inFunctionView(person, v));
      // Exactly one of "in a named function" / "in Others" is true for everyone.
      expect(inFunctionView(person, "others")).toBe(!inAnyNamed);
    }
  });
});

describe("the tab bar", () => {
  it("runs All, the eight functions, then Others", () => {
    expect(FUNCTION_VIEWS).toEqual([
      "all",
      "sales",
      "marketing",
      "operations",
      "handholding",
      "hr",
      "admin",
      "accounts",
      "apps",
      "others",
    ]);
  });

  it("labels every view", () => {
    for (const v of FUNCTION_VIEWS) {
      expect(FUNCTION_LABELS[v as FunctionView]).toBeTruthy();
    }
    expect(FUNCTION_LABELS.apps).toBe("Apps/IT");
  });
});

describe("the bar and the matcher agree", () => {
  it("gives every matchable function exactly one tab", async () => {
    const { BUSINESS_FUNCTIONS } = await import("@/lib/org/functions");
    const tabs = FUNCTION_VIEWS.filter((v) => v !== "all" && v !== "others");
    // Same set — order differs on purpose (precedence vs. reading order).
    expect([...tabs].sort()).toEqual([...BUSINESS_FUNCTIONS].sort());
  });
});
