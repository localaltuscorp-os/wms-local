// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { MobileToday } from "@/components/dashboard/mobile-today";
import type { MyTodayTask } from "@/lib/queries/my-day";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

// Partial maps are fine for the test — the component falls back per-status.
const statusLabels = {
  not_started: "Not Started",
  follow_up: "Follow Up",
} as Partial<Record<TaskStatus, string>> as Record<TaskStatus, string>;
const statusTones = {
  not_started: "rose",
  follow_up: "blue",
} as Partial<Record<TaskStatus, StatusColorToken>> as Record<TaskStatus, StatusColorToken>;

function task(over: Partial<MyTodayTask>): MyTodayTask {
  return {
    id: "t1",
    taskNo: 1001,
    title: "Prepare the Q3 deck",
    client: "Acme",
    subject: "Marketing",
    description: null,
    status: "follow_up" as TaskStatus,
    priority: "not_imp_not_urgent",
    dueAt: new Date(),
    overdue: false,
    ...over,
  };
}

afterEach(cleanup);

describe("MobileToday", () => {
  it("splits tasks into Overdue and Due today groups and links to the task page", () => {
    const { getByText, getByRole } = render(
      <MobileToday
        firstName="Hetesh"
        tasks={[
          task({ id: "a", title: "Overdue thing", overdue: true, priority: "imp_urgent" }),
          task({ id: "b", title: "Today thing" }),
        ]}
        doneToday={2}
        statusLabels={statusLabels}
        statusTones={statusTones}
      />,
    );

    expect(getByText(/Hetesh/)).toBeTruthy();
    expect(getByRole("heading", { name: "Overdue" })).toBeTruthy();
    expect(getByRole("heading", { name: "Due today" })).toBeTruthy();
    expect(getByText(/1 due today/)).toBeTruthy();
    expect(getByText(/1 overdue/)).toBeTruthy();
    expect(getByText(/2 done/)).toBeTruthy();

    const link = getByRole("link", { name: /Overdue thing/ });
    expect(link.getAttribute("href")).toBe("/tasks/a");
    // Critical tasks render the flame badge, not a plain label.
    expect(within(link as HTMLElement).getByText("Critical")).toBeTruthy();
  });

  it("renders the all-clear state when there are no tasks", () => {
    const { getByText } = render(
      <MobileToday
        firstName="Hetesh"
        tasks={[]}
        doneToday={0}
        statusLabels={statusLabels}
        statusTones={statusTones}
      />,
    );
    expect(getByText(/all clear for today/i)).toBeTruthy();
    expect(getByText(/0 due today/)).toBeTruthy();
  });
});
