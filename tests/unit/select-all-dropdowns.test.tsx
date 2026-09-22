// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { SelectAllBar } from "@/components/ui/select-all-bar";
import { MultiSelect } from "@/components/ui/multi-select";

/**
 * SELECT ALL, THEN UNTICK THE ONE OR TWO YOU DON'T WANT.
 *
 * That workflow is the whole reason the bar exists (Manan, 2026-09-21), and it
 * only works if "select all" leaves the list in a state you can then SUBTRACT
 * from. The trap it is guarding against is the shortcut that stores a standing
 * "everyone" rule instead of ticking every option: with one of those, unticking
 * a name doesn't remove one person — it throws the rule away and leaves you with
 * that single name. So the assertions below are about what the selection
 * CONTAINS after each click, never just about a count on screen.
 */

afterEach(cleanup);

// cmdk (the list inside MultiSelect) measures itself on mount. jsdom has no
// ResizeObserver, so without this stub the component throws before it renders.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// …and it scrolls the highlighted row into view, which jsdom also lacks.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

describe("SelectAllBar", () => {
  const OPTIONS = ["a", "b", "c", "d"];

  function Harness({ initial = [] as string[] }) {
    const [sel, setSel] = React.useState<string[]>(initial);
    return (
      <div>
        <SelectAllBar
          count={sel.length}
          total={OPTIONS.length}
          onSelectAll={() => setSel(OPTIONS)}
          onClear={() => setSel([])}
        />
        <p data-testid="sel">{sel.join(",")}</p>
      </div>
    );
  }

  it("ticks every option, and says how many that is before you click", () => {
    render(<Harness />);
    const btn = screen.getByRole("button", { name: "Select all (4)" });
    fireEvent.click(btn);
    expect(screen.getByTestId("sel").textContent).toBe("a,b,c,d");
  });

  it("leaves a selection you can subtract from — 'all but one' is reachable", () => {
    function Sub() {
      const [sel, setSel] = React.useState<string[]>([]);
      return (
        <div>
          <SelectAllBar
            count={sel.length}
            total={OPTIONS.length}
            onSelectAll={() => setSel(OPTIONS)}
            onClear={() => setSel([])}
          />
          <button type="button" onClick={() => setSel((s) => s.filter((x) => x !== "c"))}>
            drop c
          </button>
          <p data-testid="sel">{sel.join(",")}</p>
        </div>
      );
    }
    render(<Sub />);
    fireEvent.click(screen.getByRole("button", { name: "Select all (4)" }));
    fireEvent.click(screen.getByRole("button", { name: "drop c" }));
    // Not "c" on its own, and not empty: the other three survive.
    expect(screen.getByTestId("sel").textContent).toBe("a,b,d");
  });

  it("hides Select all once everything is ticked", () => {
    render(<Harness initial={OPTIONS} />);
    expect(screen.queryByRole("button", { name: /Select all/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
  });

  it("hides Clear while nothing is ticked", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(screen.getByRole("button", { name: "Select all (4)" })).toBeTruthy();
  });

  it("draws nothing at all when there is nothing to pick from", () => {
    const { container } = render(
      <SelectAllBar count={0} total={0} onSelectAll={() => {}} onClear={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("MultiSelect — the filter dropdown the whole app shares", () => {
  const OPTIONS = [
    { value: "1", label: "Aarti" },
    { value: "2", label: "Bhavin" },
    { value: "3", label: "Chirag" },
  ];

  function Harness() {
    const [sel, setSel] = React.useState<string[]>([]);
    return (
      <div>
        <MultiSelect options={OPTIONS} selected={sel} onChange={setSel} />
        <p data-testid="sel">{sel.join(",")}</p>
      </div>
    );
  }

  it("offers Select all in the open panel and ticks the whole list", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /All Employees/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select all (3)" }));
    expect(screen.getByTestId("sel").textContent).toBe("1,2,3");
    // …and the trigger now reports the selection rather than the placeholder.
    expect(screen.getByRole("button", { name: /3 selected/ })).toBeTruthy();
  });
});
