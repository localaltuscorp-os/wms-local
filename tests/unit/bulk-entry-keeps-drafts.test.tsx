// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(app)/tasks/actions", () => ({
  bulkCreateTasks: vi.fn(async () => ({ ok: true, created: 0, failed: [] })),
}));
vi.mock("@/lib/toast", () => ({ fireToast: vi.fn() }));
// The file importer is a separate surface with its own server actions; stub it
// so this test is only about the grid's drafts surviving the round trip.
vi.mock("@/components/tasks/task-import", () => ({ TaskImport: () => <div data-testid="importer" /> }));

import { TasksBulkEntry } from "@/components/tasks/tasks-bulk-entry";

const ME = { id: "me", name: "Vinal" };
const ROSTER = [ME, { id: "o", name: "Om" }];

function setup() {
  render(<TasksBulkEntry roster={ROSTER} clients={["Altus Corp"]} subjects={["App"]} me={ME} />);
}
const clientCells = () => screen.getAllByPlaceholderText("Client / task title") as HTMLInputElement[];
/** `noUncheckedIndexedAccess` is on, and every index here is one the test just
 *  asserted exists — assert it for the compiler rather than branching. */
const clientCell = (i: number) => clientCells()[i]!;
const subjectCell = (i: number) => screen.getAllByPlaceholderText("Subject")[i]! as HTMLInputElement;
const descCell = (i: number) => screen.getAllByPlaceholderText("What needs doing?")[i]! as HTMLInputElement;

describe("Bulk Add — drafts survive Proceed → Back to Grid", () => {
  afterEach(cleanup);

  it("still shows every typed row after returning from the review", () => {
    setup();
    // Two filled rows and one that is only half-typed. The half-typed one is the
    // strict case: `proceed()` only emits rows with a Client or a Doer, so a row
    // like this never reaches the review and could not be handed back from it —
    // it survives only because the grid itself is never unmounted.
    fireEvent.change(clientCell(0), { target: { value: "Altus Corp" } });
    fireEvent.change(clientCell(1), { target: { value: "Carbide India" } });
    fireEvent.change(subjectCell(0), { target: { value: "App" } });
    fireEvent.change(descCell(1), { target: { value: "File the September return" } });

    fireEvent.click(screen.getByRole("button", { name: /Proceed to Review/i }));
    // We are on the review step.
    const back = screen.getByRole("button", { name: /Back to Grid/i });
    // ...and the grid is hidden rather than destroyed.
    expect(clientCell(0).value).toBe("Altus Corp");

    fireEvent.click(back);

    expect(screen.queryByRole("button", { name: /Back to Grid/i })).toBeNull();
    expect(clientCell(0).value).toBe("Altus Corp");
    expect(clientCell(1).value).toBe("Carbide India");
    expect(subjectCell(0).value).toBe("App");
    expect(descCell(1).value).toBe("File the September return");
  });

  it("survives more than one trip", () => {
    setup();
    fireEvent.change(clientCell(0), { target: { value: "Repeat Co" } });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Proceed to Review/i }));
      fireEvent.click(screen.getByRole("button", { name: /Back to Grid/i }));
    }
    expect(clientCell(0).value).toBe("Repeat Co");
  });

  it("keeps rows the user added, not just the six it starts with", () => {
    setup();
    const startCount = clientCells().length;
    fireEvent.click(screen.getByRole("button", { name: /Add Row/i }));
    fireEvent.change(clientCell(startCount), { target: { value: "Seventh Row Co" } });

    fireEvent.click(screen.getByRole("button", { name: /Proceed to Review/i }));
    fireEvent.click(screen.getByRole("button", { name: /Back to Grid/i }));

    expect(clientCells()).toHaveLength(startCount + 1);
    expect(clientCell(startCount).value).toBe("Seventh Row Co");
  });

  it("shows the grid and the review one at a time", () => {
    setup();
    fireEvent.change(clientCell(0), { target: { value: "Altus Corp" } });
    // Entry step: no review table.
    expect(screen.queryByRole("button", { name: /Back to Grid/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Proceed to Review/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Proceed to Review/i }));
    // Review step: the grid is still mounted but must not be on screen with it.
    const gridWrap = clientCell(0).closest("div.hidden");
    expect(gridWrap).not.toBeNull();
  });
});
