// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { WeeklyGoalTaskGroup } from "@/components/weekly-goals/weekly-goal-task-group";
import { WeeklyGoalBadge } from "@/components/weekly-goals/weekly-goal-badge";
import type { VirtualTaskRow } from "@/lib/weekly-goals/as-task-row";

const GOAL: VirtualTaskRow = {
  kind: "weekly_goal",
  id: "wg:g1",
  goalId: "g1",
  title: "Complete WMS Dashboard",
  client: null,
  subject: null,
  priority: "imp_not_urgent",
  status: "not_started",
  dueAt: "2026-09-13",
  doerId: "e1",
  doerName: "Vinal Patil",
  pct: 0,
  weekStart: "2026-09-07",
  href: "/goals/weekly?focus=g1",
};

const header = () => screen.getByText("This Week's Goals").closest("header")!;

describe("This Week's Goals — header", () => {
  afterEach(cleanup);

  it("names itself once, not twice", () => {
    render(<WeeklyGoalTaskGroup goals={[GOAL]} />);
    const h = header();
    // The "WEEKLY GOAL" chip sat immediately left of a heading reading "This
    // Week's Goals" — the same fact, stated twice, side by side. Only the
    // heading remains. ("Open Weekly Goals" is a link out, not a label, so it
    // is excluded before the check.)
    const withoutTheLink = h.textContent!.replace(/Open Weekly Goals/i, "");
    expect(withoutTheLink).not.toMatch(/weekly goal/i);
    expect(within(h).getByText("This Week's Goals")).toBeTruthy();
  });

  it("keeps everything else in the header", () => {
    render(<WeeklyGoalTaskGroup goals={[GOAL, { ...GOAL, id: "wg:g2", goalId: "g2" }]} />);
    const h = header();
    expect(within(h).getByText("2")).toBeTruthy();                       // count pill
    expect(within(h).getByRole("link", { name: /open weekly goals/i })).toBeTruthy();
    expect(within(h).getByRole("button", { name: /this week's goals/i })).toBeTruthy(); // collapse
  });

  it("still lists the goals themselves", () => {
    render(<WeeklyGoalTaskGroup goals={[GOAL]} />);
    expect(screen.getAllByText("Complete WMS Dashboard").length).toBeGreaterThan(0);
  });

  it("renders nothing at all when the week has no goals", () => {
    const { container } = render(<WeeklyGoalTaskGroup goals={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("leaves the chip available for the kanban goal card", () => {
    // Deliberately NOT deleted: on the kanban board a goal card sits in the
    // same status column as real task cards, and this chip is the only thing
    // that tells them apart — there is no heading beside it to duplicate.
    render(<WeeklyGoalBadge />);
    expect(screen.getByText("Weekly Goal")).toBeTruthy();
  });
});
