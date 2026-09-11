import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MODULE_ORDER } from "@/lib/module-theme";

/**
 * EVERY HUB CARD MUST LOOK LIKE ITSELF.
 *
 * The palette's whole job is "every module has a specific colour so we know
 * which module we're in" — and it had quietly stopped doing it: WMS, Project and
 * Operations carried byte-identical values, so the front door showed three
 * indistinguishable red cards. Project inherited the red on the argument that
 * the plan and the task list are two windows onto the same records; Operations
 * inherited it because the ROOM wears the WMS theme inside. Both were locally
 * reasonable and collectively unreadable.
 *
 * Parsed out of the source rather than imported: HUB_PASTEL and the logo
 * palette are module-private consts in a page and a component, and exporting
 * them only so a test can read them would widen their API for no other reason.
 */
function parsePalette(file: string, startMarker: string, endMarker: string) {
  const src = readFileSync(file, "utf8");
  const block = src.slice(src.indexOf(startMarker), src.indexOf(endMarker));
  const out = new Map<string, { from: string; to: string; ink: string }>();
  const re = /^\s*"?([a-z-]+)"?:\s*\{\s*from: "(#\w+)", to: "(#\w+)", ink: "(#\w+)"/gm;
  for (const m of block.matchAll(re)) {
    out.set(m[1]!, { from: m[2]!, to: m[3]!, ink: m[4]! });
  }
  return out;
}

const CARDS = parsePalette("app/(app)/hub/page.tsx", "const HUB_PASTEL", "const PASTEL_FALLBACK");
const TILES = parsePalette("components/hub/module-logos.tsx", "const PAL", "function Glyph");

/** Only the modules actually rendered on the hub have to be distinguishable. */
const onHub = <T,>(m: Map<string, T>) =>
  MODULE_ORDER.filter((id) => m.has(id)).map((id) => [id, m.get(id)!] as const);

describe("the hub palette", () => {
  it("has a card for every module on the hub", () => {
    for (const id of MODULE_ORDER) {
      expect(CARDS.has(id), `${id} has no HUB_PASTEL entry`).toBe(true);
      expect(TILES.has(id), `${id} has no logo tile entry`).toBe(true);
    }
  });

  it("gives no two hub cards the same ink", () => {
    const seen = new Map<string, string>();
    for (const [id, c] of onHub(CARDS)) {
      const clash = seen.get(c.ink);
      expect(clash, `${id} and ${clash} both use ink ${c.ink}`).toBeUndefined();
      seen.set(c.ink, id);
    }
  });

  it("gives no two hub cards the same background", () => {
    const seen = new Map<string, string>();
    for (const [id, c] of onHub(CARDS)) {
      const key = `${c.from}|${c.to}`;
      const clash = seen.get(key);
      expect(clash, `${id} and ${clash} share the card fill ${key}`).toBeUndefined();
      seen.set(key, id);
    }
  });

  it("gives no two hub glyph tiles the same ink", () => {
    const seen = new Map<string, string>();
    for (const [id, t] of onHub(TILES)) {
      const clash = seen.get(t.ink);
      expect(clash, `${id} and ${clash} both use tile ink ${t.ink}`).toBeUndefined();
      seen.set(t.ink, id);
    }
  });

  it("keeps Project and Operations off the WMS red specifically", () => {
    // The exact regression this file exists for.
    const wms = CARDS.get("wms")!;
    for (const id of ["project-plan", "operations"] as const) {
      expect(CARDS.get(id)!.ink, id).not.toBe(wms.ink);
      expect(CARDS.get(id)!.from, id).not.toBe(wms.from);
    }
  });
});
