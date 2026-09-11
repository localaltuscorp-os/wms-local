import { describe, expect, it } from "vitest";
import { HR_CONSOLE_MODULES, locateHrRoute } from "@/lib/hr/console-nav";

/**
 * Clicking a MODULE in the HR rail must land on that module's blank pane - the
 * step list opens beside you and the content column stays empty until you pick
 * a step. Clicking a STEP is what puts content on screen.
 *
 * Two different things used to break that, and these tests are about both:
 *
 *  1. /hr/<module> rendered a card grid repeating every step. Not testable from
 *     here (it's a route's JSX), but it is why this file exists.
 *  2. A module and one of its own steps pointed at the SAME url. /hr/exit was
 *     both the Exit module's route and its "Exit Interview & Handover" step, and
 *     because a concrete route always shadows [stage] in Next.js, the module row
 *     could never win - clicking Exit opened the exit workspace. That one is a
 *     pure data collision, so it is caught here.
 */
describe("a lifecycle module's own route is free for its landing pane", () => {
  const lifecycle = HR_CONSOLE_MODULES.filter((m) => m.subModules.length > 0);

  it("has lifecycle modules to check", () => {
    // Guards against the filter silently matching nothing and every assertion
    // below passing vacuously.
    expect(lifecycle.length).toBeGreaterThanOrEqual(6);
  });

  it("no step sits on its own module's landing url", () => {
    for (const mod of lifecycle) {
      const landing = `/hr/${mod.id}`;
      for (const sub of mod.subModules) {
        const href = sub.href.split("?")[0] ?? sub.href;
        expect(
          href,
          `${mod.title} > ${sub.title} occupies ${landing}, so the module row can never show its landing pane`,
        ).not.toBe(landing);
      }
    }
  });

  it("no step of ANY module squats on another module's landing url", () => {
    const landings = new Map(lifecycle.map((m) => [`/hr/${m.id}`, m.title]));
    for (const mod of HR_CONSOLE_MODULES) {
      for (const sub of mod.subModules) {
        const href = sub.href.split("?")[0] ?? sub.href;
        const owner = landings.get(href);
        expect(
          owner,
          `${mod.title} > ${sub.title} points at ${href}, which is ${owner}'s landing url`,
        ).toBeUndefined();
      }
    }
  });

  it("resolves each landing url to that module and to NO step", () => {
    // subModule === null is what makes the console show the blank pane rather
    // than treating the landing as a step that is already open.
    for (const mod of lifecycle) {
      const found = locateHrRoute(`/hr/${mod.id}`);
      expect(found.module?.id).toBe(mod.id);
      expect(found.subModule).toBeNull();
    }
  });

  it("still resolves a step url to that step", () => {
    // The counterweight: if the rules above ever start reporting "no step" for
    // everything, these would fail too.
    for (const mod of lifecycle) {
      for (const sub of mod.subModules) {
        if (sub.external) continue;
        const found = locateHrRoute(sub.href.split("?")[0] ?? sub.href);
        expect(found.subModule, `${mod.title} > ${sub.title}`).not.toBeNull();
      }
    }
  });
});
