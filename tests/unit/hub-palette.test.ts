import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MODULE_ORDER } from "@/lib/module-theme";

/**
 * EVERY MODULE TILE MUST LOOK LIKE ITSELF.
 *
 * The palette's whole job is "every module has a specific colour so we know
 * which module we're in" — and it had quietly stopped doing it: WMS, Project and
 * Operations carried byte-identical values, so the front door showed three
 * indistinguishable red cards. Project inherited the red on the argument that
 * the plan and the task list are two windows onto the same records; Operations
 * inherited it because the ROOM wears the WMS theme inside. Both were locally
 * reasonable and collectively unreadable.
 *
 * The hub's HUB_PASTEL card grid was removed by the Aura redesign (2026-09-15),
 * so only the logo-tile palette is checked now.
 *
 * Parsed out of the source rather than imported: the logo palette is a
 * module-private const, and exporting it only so a test can read it would
 * widen its API for no other reason.
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

const TILES = parsePalette("components/hub/module-logos.tsx", "const PAL", "function Glyph");

describe("the module tile palette", () => {
  it("has a logo tile for every module", () => {
    for (const id of MODULE_ORDER) {
      expect(TILES.has(id), `${id} has no logo tile entry`).toBe(true);
    }
  });

  it("gives no two glyph tiles the same ink", () => {
    const seen = new Map<string, string>();
    for (const id of MODULE_ORDER) {
      const t = TILES.get(id);
      if (!t) continue;
      const clash = seen.get(t.ink);
      expect(clash, `${id} and ${clash} both use tile ink ${t.ink}`).toBeUndefined();
      seen.set(t.ink, id);
    }
  });

  it("keeps Project and Operations off the WMS red specifically", () => {
    // The exact regression this file exists for.
    const wms = TILES.get("wms")!;
    for (const id of ["project-plan", "operations"] as const) {
      expect(TILES.get(id)!.ink, id).not.toBe(wms.ink);
    }
  });
});
