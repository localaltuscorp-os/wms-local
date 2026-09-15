import { describe, it, expect } from "vitest";
import { TASK_TEMPLATE_COLUMNS } from "@/lib/tasks/template-columns";

/**
 * The Tasks bulk-import template offers a dropdown on a column only when that
 * column's manifest entry names a `source`. Client shipped with `source: null`,
 * so the workbook had a Client COLUMN and no list behind it — a bare text box
 * sitting between two columns that both had pickers. Nothing failed; the
 * dropdown was simply never generated, and the only way to notice was to open
 * the file.
 *
 * This pins the columns that must offer their roster. It is the manifest half
 * of the contract; the route supplies the values for each source.
 */

const bySource = (field: string) => TASK_TEMPLATE_COLUMNS.find((c) => c.field === field)?.source;

describe("Tasks template — every roster column offers its list", () => {
  it.each([
    ["client", "client"],
    ["subject", "subject"],
    ["doer", "doer"],
    ["initiator", "initiator"],
    ["priority", "priority"],
    ["status", "status"],
    ["recurrence", "recurrence"],
  ])("%s is backed by the %s list", (field, source) => {
    expect(bySource(field)).toBe(source);
  });

  it("keeps free-text and date columns free of a dropdown", () => {
    // A list on these would turn typing into a fight with Excel.
    for (const field of ["description", "notes", "dueDate", "tags"]) {
      const col = TASK_TEMPLATE_COLUMNS.find((c) => c.field === field);
      if (!col) continue;
      expect(col.source).toBeNull();
    }
  });

  it("never names a source on a read-only column", () => {
    // A locked cell cannot be typed into, so a picker on one is a dead control.
    for (const col of TASK_TEMPLATE_COLUMNS) {
      if (col.locked) expect(col.source).toBeNull();
    }
  });

  it("gives the free-text roster columns an example to copy", () => {
    // Yes/No is the exception and needs none — the two options ARE the
    // documentation, and the dropdown shows both.
    for (const col of TASK_TEMPLATE_COLUMNS) {
      if (!col.source || !col.writable || col.source === "yesno") continue;
      expect(col.examples?.length ?? 0, `${col.field} has no examples`).toBeGreaterThan(0);
    }
  });
});
