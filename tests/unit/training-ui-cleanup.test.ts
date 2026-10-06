import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Training WMS cleanup", () => {
  it("keeps Learning Library tabs and adds material date and creator filters", () => {
    const page = source("app/(app)/training/page.tsx");
    const table = source("components/training/materials-table.tsx");
    expect(page).toContain('title="Learning Library"');
    expect(page).toContain('label: "Trainings"');
    expect(page).toContain('label: "Self Learning"');
    expect(page).toContain('label: "Learning Shares"');
    expect(table).toContain("Any Date");
    expect(table).toContain('placeholder="Created By"');
  });

  it("keeps creator ids in library read models", () => {
    const query = source("lib/queries/learning-library.ts");
    expect(query).toContain("employeeId: tcSelfLearning.employeeId");
    expect(query).toContain("employeeId: tcShares.employeeId");
  });

  it("opens self-learning form in a modal without changing form fields", () => {
    const dialog = source("components/training/learning/self-learning-log-dialog.tsx");
    const form = source("components/training/learning/self-learning-form.tsx");
    expect(dialog).toContain("Dialog.Content");
    expect(dialog).toContain("Log an Entry");
    for (const field of ["Type", "What did you learn from", "Date", "Source Link", "Minutes", "Start time", "End time", "Evidence Link", "Notes"]) {
      expect(form).toContain(field);
    }
  });

  it("filters calendar by date and creator and schedules inside a modal", () => {
    const page = source("app/(app)/training/calendar/page.tsx");
    const board = source("components/training/calendar/calendar-board.tsx");
    const query = source("lib/queries/training-calendar.ts");
    expect(page).toContain("Any Date");
    expect(page).toContain("Created By");
    expect(page).toContain("istYmd(s.scheduledAt)");
    expect(page).toContain("s.createdById === selectedCreator");
    expect(board).toContain("Dialog.Content");
    expect(board).toContain("Schedule a Training Session");
    expect(query).toContain("createdById: tcSessions.createdById");
  });

  it("uses compact obligations table from existing metric data", () => {
    const page = source("app/(app)/training/obligations/page.tsx");
    expect(page).toContain("<table");
    for (const heading of ["Employee", "Function", "Give", "Attend", "Self-Learning", "Share", "Status"]) {
      expect(page).toContain(heading);
    }
    expect(page).toContain("obligationsForRoster");
  });
});
