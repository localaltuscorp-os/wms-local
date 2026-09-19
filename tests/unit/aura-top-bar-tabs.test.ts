import { describe, it, expect } from "vitest";
import { TAB_ROOMS, roomsFor, tabsAndMore } from "@/lib/aura-rooms";
import { MODULE_ORDER } from "@/lib/module-theme";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * The top bar's tabs (account holder, 2026-09-19): "3 options — WMS, Goals,
 * Project — and a More dropdown, which will look clean; do this all over."
 */

const ids = (rs: { id: WorkspaceId }[]) => rs.map((r) => r.id);

describe("the top bar's three tabs", () => {
  const everyone = roomsFor(MODULE_ORDER);

  it("gives WMS, Goals and Project a tab, and puts every other room under More", () => {
    const { tabs, more } = tabsAndMore(everyone);
    expect(ids(tabs)).toEqual(["wms", "goals", "project-plan"]);
    expect(ids(more)).toEqual(MODULE_ORDER.filter((id) => !TAB_ROOMS.includes(id)));
  });

  it("keeps the three in that order whatever order the rooms come in", () => {
    const shuffled = roomsFor(["hr", "project-plan", "billing", "wms", "goals"]);
    const { tabs, more } = tabsAndMore(shuffled);
    expect(ids(tabs)).toEqual(["wms", "goals", "project-plan"]);
    expect(ids(more)).toEqual(["hr", "billing"]);
  });

  it("gives no tab to a room the person may not enter", () => {
    const { tabs, more } = tabsAndMore(roomsFor(["wms", "employees", "hr"]));
    expect(ids(tabs)).toEqual(["wms"]);
    expect(ids(more)).toEqual(["employees", "hr"]);
  });

  it("moves the tabs that do not fit to the front of More, one at a time", () => {
    expect(ids(tabsAndMore(everyone, 2).tabs)).toEqual(["wms", "goals"]);
    expect(ids(tabsAndMore(everyone, 2).more).slice(0, 2)).toEqual(["project-plan", "productivity"]);
    expect(tabsAndMore(everyone, 0).tabs).toEqual([]);
    expect(ids(tabsAndMore(everyone, 0).more).slice(0, 3)).toEqual(["wms", "goals", "project-plan"]);
  });

  it("puts every room in exactly one place, at every width", () => {
    for (let fit = 0; fit <= 5; fit++) {
      const { tabs, more } = tabsAndMore(everyone, fit);
      expect([...ids(tabs), ...ids(more)].sort()).toEqual(ids(everyone).sort());
    }
  });
});
