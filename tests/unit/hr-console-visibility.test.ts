import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";
import { visibleConsoleModules } from "@/lib/hr/console-visibility";
import type { HrConsoleModule } from "@/lib/hr/console-nav";

/**
 * THE HR CONSOLE MUST NOT OFFER WHAT THE MATRIX HAS TAKEN AWAY.
 *
 * Enforcement was never the gap — `app/(app)/layout.tsx` runs `requirePathView`
 * on every request, so a denied module cannot be reached even by typing its URL.
 * The gap was that the HR console never ASKED. Its rail is built from
 * `HR_CONSOLE_MODULES`, which knows nothing about permissions, so switching
 * "HR → CTC" off for somebody left the step sitting there looking exactly as
 * available as everything else — and clicking it bounced them to the hub.
 */

const Icon = (() => null) as unknown as HrConsoleModule["Icon"];

const mod = (
  id: string,
  href: string | undefined,
  steps: { id: string; href: string }[],
): HrConsoleModule => ({
  id,
  title: id,
  Icon,
  href,
  external: false,
  subModules: steps.map((s) => ({
    id: s.id,
    title: s.id,
    blurb: "",
    Icon,
    href: s.href,
    external: false,
  })),
});

const CONSOLE: HrConsoleModule[] = [
  mod("during-employment", undefined, [
    { id: "ctc", href: "/hr/ctc" },
    { id: "letters", href: "/hr/letters/selection" },
  ]),
  mod("post-interview", undefined, [
    { id: "candidates", href: "/hr/candidates" },
    { id: "offers", href: "/hr/letters/selection" },
  ]),
  mod("policies", "/policies", []),
  mod("help-desk", "/support", []),
];

describe("nothing is hidden when the matrix does not govern you", () => {
  it("returns everything for null — a master admin, or an ungoverned row", () => {
    // The resolver's own convention: null means "not governed", an EMPTY SET
    // would mean "deny everything". Conflating them would blank the rail.
    expect(visibleConsoleModules(CONSOLE, null)).toHaveLength(4);
  });

  it("returns everything for an empty set too — nothing has been switched off", () => {
    expect(visibleConsoleModules(CONSOLE, new Set())).toHaveLength(4);
  });
});

describe("a denied step disappears from its module", () => {
  it("drops exactly the denied one and keeps its siblings", () => {
    const out = visibleConsoleModules(CONSOLE, new Set(["hr.ctc"]));
    const during = out.find((m) => m.id === "during-employment")!;
    expect(during.subModules.map((s) => s.id)).toEqual(["letters"]);
    // Untouched modules are untouched.
    expect(out.find((m) => m.id === "post-interview")!.subModules).toHaveLength(2);
  });

  it("takes the whole module with it when every step is gone", () => {
    // Stages like Pre-Interview have no page of their own, so a stage whose
    // steps have all been denied has nothing left to open. Drawing it would
    // leave a rail row that expands into an empty list.
    const out = visibleConsoleModules(
      CONSOLE,
      new Set(["hr.ctc", "hr.letters"]),
    );
    // `during-employment` loses both its steps; `post-interview` keeps
    // `hr.candidates` and still shows, even though its other step was denied.
    expect(out.map((m) => m.id)).toEqual(["post-interview", "policies", "help-desk"]);
  });

  it("does not mutate the list it was given", () => {
    const before = JSON.stringify(CONSOLE);
    visibleConsoleModules(CONSOLE, new Set(["hr.ctc"]));
    expect(JSON.stringify(CONSOLE)).toBe(before);
  });
});

describe("a module that IS the destination is judged on its own page", () => {
  it("hides a standalone module whose page is denied", () => {
    // NOTE THE NODE KEY. The console's standalone "Policies" entry points at
    // `/policies`, and the catalogue claims that route for `platform.policies` —
    // NOT for `hr.policies`, which owns `/hr/policies/[key]`. So denying
    // `hr.policies` does not hide the console's Policies row, and denying
    // `platform.policies` does. That is the catalogue's classification, not a
    // choice made here; the filter simply follows it.
    const out = visibleConsoleModules(CONSOLE, new Set(["platform.policies"]));
    expect(out.map((m) => m.id)).toEqual([
      "during-employment",
      "post-interview",
      "help-desk",
    ]);
  });

  it("does NOT hide it for the node that owns a different route", () => {
    // Guards the nuance above against a future "tidy-up" that assumes the two
    // policies nodes are interchangeable.
    const out = visibleConsoleModules(CONSOLE, new Set(["hr.policies"]));
    expect(out.map((m) => m.id)).toContain("policies");
  });

  it("keeps a standalone module whose page is NOT denied", () => {
    const out = visibleConsoleModules(CONSOLE, new Set(["hr.helpdesk"]));
    expect(out.map((m) => m.id)).toContain("policies");
    expect(out.map((m) => m.id)).not.toContain("help-desk");
  });

  it("tolerates a step whose href the catalogue does not claim", () => {
    // `nodeKeyForPath` returns null for anything unclassified, and an
    // unclassified route must stay visible — `requirePathView` is likewise a
    // no-op for it, so hiding it would make the rail stricter than the guard.
    const out = visibleConsoleModules(
      [mod("odd", undefined, [{ id: "misc", href: "/hr/not-in-the-catalogue" }])],
      new Set(["hr.ctc"]),
    );
    expect(out).toHaveLength(1);
  });
});

describe("the console reads the filtered list, not the raw catalogue", () => {
  it("the rail takes modules as a PROP", () => {
    // If the rail imported HR_CONSOLE_MODULES itself it could draw something
    // the person has been denied, and nothing would catch it.
    const rail = codeOf("components/hr/console/hr-module-rail.tsx");
    expect(rail).not.toMatch(/HR_CONSOLE_MODULES/);
    expect(rail).toMatch(/modules\.map/);
  });

  it("the shell computes the filter once, on the server's hidden set", () => {
    const shell = codeOf("components/hr/console/hr-console-shell.tsx");
    expect(shell).toMatch(/visibleConsoleModules/);
    // Every lookup below must go through the filtered list.
    expect(shell).not.toMatch(/HR_CONSOLE_MODULES\.find/);
    expect(shell).not.toMatch(/HR_CONSOLE_MODULES\.some/);
  });

  it("the HR layout resolves the hidden set SERVER-side and degrades open", () => {
    const layout = codeOf("app/(app)/hr/layout.tsx");
    expect(layout).toMatch(/hiddenModuleKeys/);
    // A matrix read failure must not blank navigation for someone whose access
    // was already granted — the matrix only ever narrows.
    expect(layout).toMatch(/\.catch\(\(\) => null\)/);
  });
});
