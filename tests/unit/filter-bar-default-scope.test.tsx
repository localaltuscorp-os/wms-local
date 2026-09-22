// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));
vi.mock("motion/react", () => ({
  motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => p.children }),
}));

import { FilterBar } from "@/components/layout/filter-bar";

/**
 * THE DEFAULT SCOPE IS NOT A FILTER — for every role.
 *
 * The bar hides its whole summary row (the "N active" count, the chips, and
 * "Clear All") while the assignee scope is still where the page put it. Nobody
 * chose the default, so a chip for it is a filter that was never applied and a
 * "Clear All" that undoes nothing.
 *
 * What makes this worth a test rather than a read-through: the default DIFFERS
 * BY ROLE since 2026-09-12 — a super-admin opens on the whole company, everyone
 * else on themselves — so "is this the default?" has two right answers and the
 * bar has to pick the one matching its viewer. Get it wrong and a super-admin
 * lands on a page already claiming one active filter.
 *
 * Rendered rather than unit-tested because the condition is consumed in three
 * places (the pill's label, its highlight, and the chip row); a test of the
 * predicate alone would not catch one of the three reading it wrongly.
 */

const EMPLOYEES = [
  { value: "emp-me", label: "Vinal Patil" },
  { value: "emp-other", label: "Sneha Kulkarni" },
];

const BASE = {
  employees: EMPLOYEES,
  subjects: [] as string[],
  offersScopeChoice: true,
};

/** The page's own starting point for this viewer, as the server would send it. */
function initialFor(scope: "me" | "everyone") {
  return {
    start: "2026-08-13",
    end: "2026-09-12",
    emp: scope === "me" ? ["emp-me"] : [],
    view: "doer" as const,
    dept: [] as string[],
    prio: [] as string[],
    subj: [] as string[],
  };
}

const summaryRow = () => screen.queryByText(/\d+ active/);
const clearAll = () => screen.queryByText("Clear All");
/* A name can appear TWICE — once summarised on the assignee pill, once as its
   own removable chip — so these assert presence rather than uniqueness. */
const shows = (text: string) => screen.getAllByText(text).length > 0;

describe("the filter bar at its default scope", () => {
  beforeEach(() => push.mockReset());
  afterEach(cleanup);

  it("shows no chips and no Clear All for a TEAM MEMBER on their own work", () => {
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: false, isSuperAdmin: false }}
        assigneeMode="default"
        initial={initialFor("me")}
      />,
    );
    expect(summaryRow()).toBeNull();
    expect(clearAll()).toBeNull();
    // The pill answers "whose numbers am I looking at" — not the viewer's own
    // name, which would read as a filter somebody else applied.
    expect(screen.getByText("Only Me")).toBeTruthy();
  });

  it("shows no chips and no Clear All for an ADMIN on their own work", () => {
    /* THE ROLE CHANGE. An admin used to open /tasks on the whole company; they
       now open on themselves like everyone else, so this is the state an admin
       actually arrives in and it must be as quiet as a team member's. */
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: true, isSuperAdmin: false }}
        assigneeMode="default"
        initial={initialFor("me")}
      />,
    );
    expect(summaryRow()).toBeNull();
    expect(clearAll()).toBeNull();
    expect(screen.getByText("Only Me")).toBeTruthy();
  });

  it("shows no chips and no Clear All for a SUPER-ADMIN on the whole company", () => {
    /* The case the old code got wrong: "all employees" was only ever a widening
       somebody had chosen, so it always chipped. For this viewer it is the
       starting point. */
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: true, isSuperAdmin: true }}
        assigneeMode="all"
        initial={initialFor("everyone")}
      />,
    );
    expect(summaryRow()).toBeNull();
    expect(clearAll()).toBeNull();
    expect(screen.getByText("All Employees")).toBeTruthy();
  });
});

describe("the filter bar once the viewer has chosen something", () => {
  beforeEach(() => push.mockReset());
  afterEach(cleanup);

  it("chips a colleague a team member picked, and offers Clear All", () => {
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: false, isSuperAdmin: false }}
        assigneeMode="specific"
        initial={{ ...initialFor("me"), emp: ["emp-other"] }}
      />,
    );
    expect(summaryRow()).toBeTruthy();
    expect(clearAll()).toBeTruthy();
    expect(shows("Sneha Kulkarni")).toBe(true);
  });

  it("chips the viewer's OWN name once it is one of several", () => {
    // Your name is not a filter when it is the default and IS one when you put
    // it beside somebody else's — the same name, two meanings.
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: false, isSuperAdmin: false }}
        assigneeMode="specific"
        initial={{ ...initialFor("me"), emp: ["emp-me", "emp-other"] }}
      />,
    );
    expect(screen.getByText("2 active")).toBeTruthy();
    expect(shows("Vinal Patil")).toBe(true);
    expect(shows("Sneha Kulkarni")).toBe(true);
  });

  it("chips 'All Employees' when a NON-super-admin widens to the company", () => {
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: true, isSuperAdmin: false }}
        assigneeMode="all"
        initial={initialFor("everyone")}
      />,
    );
    expect(summaryRow()).toBeTruthy();
    expect(clearAll()).toBeTruthy();
  });

  it("chips a person a SUPER-ADMIN narrowed to", () => {
    // The mirror image of the case above: narrowing is the choice here, because
    // the company is where this viewer started.
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: true, isSuperAdmin: true }}
        assigneeMode="specific"
        initial={{ ...initialFor("everyone"), emp: ["emp-other"] }}
      />,
    );
    expect(summaryRow()).toBeTruthy();
    expect(shows("Sneha Kulkarni")).toBe(true);
  });

  it("counts only real choices, never the default, in the active count", () => {
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: false, isSuperAdmin: false }}
        assigneeMode="default"
        initial={{ ...initialFor("me"), prio: ["high"] }}
      />,
    );
    // One priority chip — and NOT a second for the viewer's own default scope.
    expect(screen.getByText("1 active")).toBeTruthy();
  });
});

describe("whose work you are reading is asked in ONE place", () => {
  beforeEach(() => push.mockReset());
  afterEach(cleanup);

  it("has no Scope segmented control, for any role", () => {
    /* Removed 2026-09-12. A "Scope: My Tasks | All Tasks" toggle sat beside the
       Assignee pill and asked the same question that pill asks, which meant the
       two could disagree — and they did: "My Tasks" wrote an empty selection
       while the dropdown's default ticks your own id, so pressing it left the
       pill reading "All Employees" over a list of your own tasks.

       Asserted for all three roles because the toggle was rendered behind a
       role flag (`!isAdmin`, later `!isSuperAdmin`), so checking one viewer
       would not have caught it surviving for another. */
    for (const me of [
      { id: "emp-me", isAdmin: false, isSuperAdmin: false },
      { id: "emp-me", isAdmin: true, isSuperAdmin: false },
      { id: "emp-me", isAdmin: true, isSuperAdmin: true },
    ]) {
      const opensOnEveryone = me.isSuperAdmin;
      render(
        <FilterBar
          {...BASE}
          me={me}
          assigneeMode={opensOnEveryone ? "all" : "default"}
          initial={initialFor(opensOnEveryone ? "everyone" : "me")}
        />,
      );
      expect(screen.queryByText("Scope"), JSON.stringify(me)).toBeNull();
      expect(screen.queryByText("My Tasks"), JSON.stringify(me)).toBeNull();
      expect(screen.queryByText("All Tasks"), JSON.stringify(me)).toBeNull();
      // The one control that does ask it is still there. (Its name is a
      // `title`, not visible text — the pill shows the VALUE and names itself
      // on hover.)
      expect(screen.getByTitle("Assignee")).toBeTruthy();
      cleanup();
    }
  });

  it("still keeps the View toggle, which asks a different question", () => {
    // Doer/Initiator survives: it swaps WHICH list you read, not whose.
    render(
      <FilterBar
        {...BASE}
        me={{ id: "emp-me", isAdmin: false, isSuperAdmin: false }}
        assigneeMode="default"
        initial={initialFor("me")}
      />,
    );
    expect(screen.getByText("View")).toBeTruthy();
    expect(screen.getByText("Doer")).toBeTruthy();
    expect(screen.getByText("Initiator")).toBeTruthy();
  });
});
