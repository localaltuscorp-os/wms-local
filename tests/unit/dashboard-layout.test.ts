import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  WIDGETS,
  WIDGET_IDS,
  hiddenWidgets,
  reconcileLayout,
  type StoredLayout,
  type WidgetId,
} from "@/lib/dashboard/widgets";

/**
 * The home screen's arrangement is read from `localStorage` — a string written
 * by a browser, possibly by an older version of the app, possibly by a user
 * with the devtools open. `reconcileLayout` is the only thing standing between
 * that string and the dashboard, so this is where it gets hostile input.
 */

const ALL = [...WIDGET_IDS] as WidgetId[];

function stored(partial: Partial<StoredLayout>): StoredLayout {
  return { v: 1, shown: [], removed: [], ...partial };
}

describe("reconcileLayout", () => {
  it("gives a first-time visitor the default layout", () => {
    expect(reconcileLayout(null, ALL)).toEqual(DEFAULT_LAYOUT.map((d) => ({ ...d })));
  });

  it("survives corrupt, empty and wrong-typed storage", () => {
    for (const junk of [undefined, null, 0, "", "not json", [], {}, { shown: "nope" }, { shown: [1, 2] }]) {
      expect(reconcileLayout(junk, ALL)).toEqual(DEFAULT_LAYOUT.map((d) => ({ ...d })));
    }
  });

  it("keeps the stored order", () => {
    const layout = reconcileLayout(
      stored({
        shown: [
          { id: "open-table", size: "l" },
          { id: "wms-loop", size: "m" },
        ],
        removed: ALL.filter((id) => id !== "open-table" && id !== "wms-loop"),
      }),
      ALL,
    );
    expect(layout.map((w) => w.id)).toEqual(["open-table", "wms-loop"]);
  });

  /**
   * The whole reason `removed` exists. Without it, a widget you took off comes
   * straight back the next time the catalogue gains an entry — because "absent
   * from storage" would mean both "never seen" and "deliberately removed".
   */
  it("does not resurrect a widget the user removed", () => {
    const kept = ALL.filter((id) => id !== "work-shape");
    const layout = reconcileLayout(
      stored({
        shown: kept.map((id) => ({ id, size: WIDGETS[id].defaultSize })),
        removed: ["work-shape"],
      }),
      ALL,
    );
    expect(layout.some((w) => w.id === "work-shape")).toBe(false);
  });

  it("appends widgets added since the layout was saved", () => {
    // A layout written when only these two existed.
    const layout = reconcileLayout(
      stored({ shown: [{ id: "wms-loop", size: "m" }, { id: "goals-week", size: "m" }] }),
      ALL,
    );
    expect(layout.slice(0, 2).map((w) => w.id)).toEqual(["wms-loop", "goals-week"]);
    // Everything else arrives in default order, after what was saved.
    expect(layout).toHaveLength(DEFAULT_LAYOUT.length);
    expect(layout.some((w) => w.id === "open-table")).toBe(true);
  });

  it("falls back to the default size when the stored one is not allowed", () => {
    // `open-table` is large-only — it is unreadable in a third of a row.
    const layout = reconcileLayout(stored({ shown: [{ id: "open-table", size: "s" }] }), ALL);
    expect(layout.find((w) => w.id === "open-table")?.size).toBe("l");
  });

  it("drops unknown ids and duplicates", () => {
    const layout = reconcileLayout(
      stored({
        shown: [
          { id: "wms-loop", size: "m" },
          { id: "wms-loop", size: "l" },
          { id: "a-widget-from-2019", size: "m" } as unknown as { id: WidgetId; size: "m" },
        ],
      }),
      ALL,
    );
    expect(layout.filter((w) => w.id === "wms-loop")).toHaveLength(1);
    expect(layout.find((w) => w.id === "wms-loop")?.size).toBe("m");
    expect(layout.every((w) => (w.id as string) !== "a-widget-from-2019")).toBe(true);
  });

  /**
   * A manager who temporarily has no reports should not LOSE the team widget's
   * place — it is filtered out of what renders, and comes back where it was.
   */
  it("hides an unavailable widget without forgetting it", () => {
    const saved = stored({
      shown: [
        { id: "team", size: "m" },
        { id: "wms-loop", size: "m" },
      ],
      removed: ALL.filter((id) => id !== "team" && id !== "wms-loop"),
    });
    const withoutTeam = ALL.filter((id) => id !== "team");

    expect(reconcileLayout(saved, withoutTeam).map((w) => w.id)).toEqual(["wms-loop"]);
    // Same stored value, team available again → back in its original position.
    expect(reconcileLayout(saved, ALL).map((w) => w.id)).toEqual(["team", "wms-loop"]);
  });

  it("never returns a widget the viewer may not see", () => {
    const onlyTwo: WidgetId[] = ["quick-actions", "open-table"];
    const layout = reconcileLayout(null, onlyTwo);
    expect(layout.map((w) => w.id).sort()).toEqual([...onlyTwo].sort());
  });

  it("can end up empty when everything is removed", () => {
    expect(reconcileLayout(stored({ shown: [], removed: ALL }), ALL)).toEqual([]);
  });
});

describe("the catalogue", () => {
  it("offers every widget a default size it is actually legible at", () => {
    for (const id of WIDGET_IDS) {
      const spec = WIDGETS[id];
      expect(spec.sizes.length, `${id} has no sizes`).toBeGreaterThan(0);
      expect(spec.sizes, `${id} default is not in its own size list`).toContain(spec.defaultSize);
    }
  });

  it("puts every widget in the default layout exactly once", () => {
    const ids = DEFAULT_LAYOUT.map((d) => d.id);
    expect([...ids].sort()).toEqual([...WIDGET_IDS].sort());
  });

  it("packs the default layout into whole six-column rows", () => {
    // s=2, m=3, l=6 — the arrangement should not leave ragged gaps.
    const span = { s: 2, m: 3, l: 6 } as const;
    let row = 0;
    for (const d of DEFAULT_LAYOUT) {
      row += span[d.size];
      if (row > 6) row = span[d.size]; // wrapped
    }
    expect(row).toBe(6);
  });
});

describe("hiddenWidgets", () => {
  it("offers exactly what is not already on the dashboard", () => {
    const layout = [{ id: "wms-loop" as WidgetId, size: "m" as const }];
    expect(hiddenWidgets(layout, ALL).map((w) => w.id)).toEqual(ALL.filter((id) => id !== "wms-loop"));
  });

  it("never offers something the viewer cannot see", () => {
    expect(hiddenWidgets([], ["quick-actions"]).map((w) => w.id)).toEqual(["quick-actions"]);
  });
});
