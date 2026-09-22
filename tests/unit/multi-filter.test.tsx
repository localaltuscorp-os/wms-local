// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { MultiFilter } from "@/components/ui/multi-filter";
import { BillingListFilterSchema } from "@/lib/validators/billing";

/**
 * A FILTER THAT TAKES MORE THAN ONE ANSWER.
 *
 * The rule that matters in every one of these is that EMPTY MEANS NO FILTER —
 * the same thing the old `<option value="">All Types</option>` meant. Get that
 * wrong in either direction and a list either shows nothing on arrival or
 * refuses to narrow, so it is asserted from both ends: the control's own empty
 * state, and the schema that parses one off a URL.
 */

afterEach(cleanup);
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

const TYPES = ["Quotation", "Proforma", "Tax Invoice"];

function Harness({ initial = [] as string[] }) {
  const [v, setV] = React.useState<string[]>(initial);
  return (
    <div>
      <MultiFilter allLabel="All Types" values={v} onChange={setV} options={TYPES} />
      <p data-testid="v">{v.join("|")}</p>
    </div>
  );
}

// The pill names the field and then what it is set to, so a screen reader
// hears the selection rather than just the column it belongs to.
const pill = () => screen.getByRole("button", { name: /^All Types:/ });

describe("MultiFilter", () => {
  it("reads as the 'all' label while nothing is ticked", () => {
    render(<Harness />);
    expect(pill().textContent).toContain("All Types");
    expect(pill().getAttribute("aria-label")).toBe("All Types: all");
  });

  it("announces the selection, not just the field it belongs to", () => {
    render(<Harness initial={["Quotation", "Proforma"]} />);
    expect(pill().getAttribute("aria-label")).toBe("All Types: Quotation, Proforma");
  });

  it("ticks several and keeps them all", () => {
    render(<Harness />);
    fireEvent.click(pill());
    fireEvent.click(screen.getByText("Quotation"));
    fireEvent.click(screen.getByText("Tax Invoice"));
    expect(screen.getByTestId("v").textContent).toBe("Quotation|Tax Invoice");
  });

  it("names one or two, and counts past that", () => {
    render(<Harness initial={["Quotation"]} />);
    expect(pill().textContent).toContain("Quotation");
    cleanup();

    render(<Harness initial={["Quotation", "Proforma"]} />);
    expect(pill().textContent).toContain("Quotation, Proforma");
    cleanup();

    // Three no longer fits, so the pill counts — with the filter's own noun,
    // because a toolbar of pills reading "3", "2", "5" says nothing.
    render(<Harness initial={TYPES} />);
    expect(pill().textContent).toContain("3 Types");
  });

  it("offers Select all, then lets you untick the one you don't want", () => {
    render(<Harness />);
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole("button", { name: "Select all (3)" }));
    expect(screen.getByTestId("v").textContent).toBe("Quotation|Proforma|Tax Invoice");
    fireEvent.click(screen.getByText("Proforma"));
    expect(screen.getByTestId("v").textContent).toBe("Quotation|Tax Invoice");
  });

  it("clears back to no filter at all", () => {
    render(<Harness initial={["Quotation", "Proforma"]} />);
    fireEvent.click(screen.getByRole("button", { name: /Quotation, Proforma/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("v").textContent).toBe("");
  });
});

describe("BillingListFilterSchema — the same filters off a URL", () => {
  const parse = (input: Record<string, unknown>) => BillingListFilterSchema.parse(input);

  it("splits one comma-separated parameter into a list", () => {
    expect(parse({ type: "tax_invoice,proforma_invoice" }).type).toEqual([
      "tax_invoice",
      "proforma_invoice",
    ]);
  });

  it("reads a missing parameter as NO FILTER, not as nothing selected", () => {
    const f = parse({});
    expect(f.type).toEqual([]);
    expect(f.status).toEqual([]);
    expect(f.customerId).toEqual([]);
  });

  it("drops a value that is not a real document type, and keeps the rest", () => {
    // A stale bookmark should narrow to what it still can and render a list,
    // rather than failing the parse and 500-ing the page.
    expect(parse({ type: "tax_invoice,not_a_type" }).type).toEqual(["tax_invoice"]);
  });

  it("de-duplicates, so a doubled parameter does not widen the IN clause", () => {
    expect(parse({ status: "draft,draft,sent" }).status).toEqual(["draft", "sent"]);
  });

  it("ignores blanks left by a trailing comma", () => {
    expect(parse({ finYear: "2025-26,,2024-25" }).finYear).toEqual(["2025-26", "2024-25"]);
  });

  it("still accepts a single value, so old links keep working", () => {
    expect(parse({ type: "quotation" }).type).toEqual(["quotation"]);
  });
});
