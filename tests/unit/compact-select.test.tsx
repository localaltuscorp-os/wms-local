// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { CompactSelect } from "@/components/ui/compact-select";

/**
 * THE POINT OF THIS CONTROL IS THE SIZE OF THE BOX.
 *
 * A native `<select>` over the employee roster opens a list as tall as the
 * roster — that is what it replaced. So the assertions below are about the
 * things a native select could not give: a capped, scrolling panel; a search
 * box that appears once the list is long enough to need one; and keyboard
 * parity, because these live in tables people fill in without a mouse.
 */

afterEach(cleanup);
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

const ROSTER = [
  "Daniel Sayyed", "Dattaram Kap", "Jeevan Bharambe", "Krish Maheshwari",
  "Manan Vasa", "Mansi Medhekar", "Mishtie Kanani", "Mitul Mehta",
  "Mohit Gupta", "Namrata Nevgi", "Om Jadhav", "Parvez Khan",
].map((name, i) => ({ value: `e${i}`, label: name }));

function Harness({
  options = ROSTER,
  initial = "",
  required = false,
}: {
  options?: { value: string; label: string }[];
  initial?: string;
  required?: boolean;
}) {
  const [v, setV] = React.useState(initial);
  return (
    <div>
      <CompactSelect value={v} onChange={setV} options={options} required={required} aria-label="Owner" />
      <p data-testid="v">{v}</p>
    </div>
  );
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Owner" }));
}

describe("CompactSelect", () => {
  it("opens a panel that is CAPPED and scrolls, however long the roster is", () => {
    render(<Harness />);
    open();
    const list = screen.getByRole("listbox");
    // The cap is the feature. Twelve names, twenty or a hundred: same box.
    expect(list.className).toContain("max-h-[240px]");
    expect(list.className).toContain("overflow-y-auto");
    // Every name is still reachable inside it — capped, not truncated.
    expect(screen.getByText("Parvez Khan")).toBeTruthy();
  });

  it("picks a name and closes", () => {
    render(<Harness />);
    open();
    fireEvent.mouseDown(screen.getByText("Mitul Mehta"));
    expect(screen.getByTestId("v").textContent).toBe("e7");
    expect(screen.queryByRole("listbox")).toBeNull();
    // …and the closed box now reads the name rather than the placeholder.
    expect(screen.getByRole("button", { name: "Owner" }).textContent).toContain("Mitul Mehta");
  });

  it("offers a search box past eight options, and filters on it", () => {
    render(<Harness />);
    open();
    const box = screen.getByRole("textbox", { name: "Search the list" });
    fireEvent.change(box, { target: { value: "man" } });
    expect(screen.getByText("Manan Vasa")).toBeTruthy();
    expect(screen.queryByText("Om Jadhav")).toBeNull();
  });

  it("leaves the search box out of a short list, where it would only be noise", () => {
    render(<Harness options={ROSTER.slice(0, 4)} />);
    open();
    expect(screen.queryByRole("textbox", { name: "Search the list" })).toBeNull();
  });

  it("keeps 'clear this field' reachable while a query is typed", () => {
    render(<Harness initial="e4" />);
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Search the list" }), {
      target: { value: "zzzz" },
    });
    // No name matches, but the empty row survives — otherwise clearing the
    // field would mean closing the panel and reopening it.
    const empty = screen.getByRole("option", { name: "—" });
    fireEvent.mouseDown(empty);
    expect(screen.getByTestId("v").textContent).toBe("");
  });

  it("drops the empty row when the field must hold a value", () => {
    render(<Harness required initial="e0" />);
    open();
    expect(screen.queryByRole("option", { name: "—" })).toBeNull();
  });

  it("moves with the arrows and commits on Enter", () => {
    render(<Harness />);
    open();
    const panel = screen.getByRole("listbox").parentElement!;
    // Opens on the empty row (nothing picked); two downs lands on the 2nd name.
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    fireEvent.keyDown(panel, { key: "Enter" });
    expect(screen.getByTestId("v").textContent).toBe("e1");
  });

  it("closes on Escape without changing the value", () => {
    render(<Harness initial="e3" />);
    open();
    const panel = screen.getByRole("listbox").parentElement!;
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByTestId("v").textContent).toBe("e3");
  });

  it("opens ON the current value, so the arrows move from where the field is", () => {
    render(<Harness initial="e4" />);
    open();
    const panel = screen.getByRole("listbox").parentElement!;
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    fireEvent.keyDown(panel, { key: "Enter" });
    // Not "the first name" — the one AFTER Manan Vasa.
    expect(screen.getByTestId("v").textContent).toBe("e5");
  });

  it("refuses a disabled option", () => {
    const opts = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Bravo", disabled: true },
    ];
    render(<Harness options={opts} />);
    open();
    fireEvent.mouseDown(screen.getByText("Bravo"));
    expect(screen.getByTestId("v").textContent).toBe("");
    expect(screen.queryByRole("listbox")).not.toBeNull();
  });
});
