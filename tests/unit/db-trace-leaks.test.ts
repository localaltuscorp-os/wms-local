import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";

/**
 * A PACKAGE PRODUCTION CANNOT USE MUST NOT BE TRACED INTO 400 FUNCTIONS.
 *
 * ── THE BUG THIS GUARDS, WHICH HAS NOW HAPPENED TWICE ──────────────────────
 * Vercel sums the uncompressed size of every deployed serverless function and
 * allows 10 GB. Next's file tracer copies a package into a function if it can
 * statically resolve a reference to it — and `lib/db/index.ts` is imported by
 * nearly every route, so anything reachable from THAT file is paid for ~430
 * times over.
 *
 * PGlite (PostgreSQL-as-WASM, used only by the local DUMMY_MODE sandbox) is
 * ~20 MB. Twice now it has been traced into the whole application:
 *
 *   1. 2026-09-15 — a literal `require("@electric-sql/pglite")`. Fixed by
 *      moving the specifier into a variable, which a static analyser cannot
 *      follow. Measured: 7.14 GB, 69% of the bill.
 *
 *   2. 2026-09-18 — the fix above was correct AND insufficient, because a
 *      static `import { drizzle as drizzlePglite } from "drizzle-orm/pglite"`
 *      sat on line 2 of the same file. `drizzle-orm/pglite` is not in
 *      `serverExternalPackages`, so webpack BUNDLED that driver into lib/db's
 *      chunk, and the driver's own externalized `import("@electric-sql/pglite")`
 *      was emitted as a LITERAL specifier — which the tracer follows exactly as
 *      it follows a literal require. Functions Storage was 14 GB against a 10 GB
 *      allowance. Measured after the fix: 428 built chunks → 0.
 *
 * ── WHY A SOURCE TEST AND NOT JUST THE SCRIPT ──────────────────────────────
 * `scripts/measure-functions-storage.mjs --leaks` is the real instrument, but it
 * reads BUILD OUTPUT, so it only answers after a full production build. This
 * test answers in the normal unit run, and it fails on the exact edit that
 * caused it — a one-line import that looks completely innocent and compiles
 * perfectly.
 *
 * ── WHAT IS ALLOWED, AND WHY THE DISTINCTION IS THE WHOLE POINT ────────────
 *   require(PGLITE)                      ALLOWED — variable, unresolvable
 *   const PGLITE = "@electric-sql/pglite" ALLOWED — a string, not a reference
 *   typeof import("@electric-sql/pglite") ALLOWED — erased at compile time
 *   import { x } from "@electric-sql/pglite"      FORBIDDEN
 *   require("@electric-sql/pglite")               FORBIDDEN
 *   import("@electric-sql/pglite")                FORBIDDEN
 *
 * The last three are the only forms the tracer can follow. A test that simply
 * banned the string would forbid the fix along with the bug.
 */

const TRAPPED = ["@electric-sql/pglite", "drizzle-orm/pglite"] as const;

/** The file that every database-touching route imports. */
const DB_INDEX = "lib/db/index.ts";

/**
 * Source with `typeof import(...)` replaced, since that form is a TYPE and is
 * erased before any bundler or tracer sees it.
 */
function valueSideOf(relPath: string): string {
  return codeOf(relPath).replace(/typeof\s+import\([^)]*\)/g, "ERASED_TYPE");
}

describe("lib/db/index.ts does not hand the tracer a resolvable specifier", () => {
  const source = valueSideOf(DB_INDEX);

  for (const spec of TRAPPED) {
    const escaped = spec.replace(/[/.]/g, "\\$&");

    it(`has no value import of ${spec}`, () => {
      expect(source).not.toMatch(new RegExp(`from\\s*["']${escaped}["']`));
    });

    it(`has no literal require of ${spec}`, () => {
      expect(source).not.toMatch(new RegExp(`require\\(\\s*["']${escaped}["']\\s*\\)`));
    });

    it(`has no literal dynamic import of ${spec}`, () => {
      // The form webpack actually emitted in the 2026-09-18 leak.
      expect(source).not.toMatch(new RegExp(`import\\(\\s*["']${escaped}["']\\s*\\)`));
    });
  }

  it("keeps the type-only reference, so the code still typechecks without a value import", () => {
    // The fix must not be "delete the import and lose the types". This asserts
    // the erased form is what remains.
    expect(codeOf(DB_INDEX)).toContain('typeof import("drizzle-orm/pglite")');
  });

  it("still reaches both through a VARIABLE, which is the approved hiding idiom", () => {
    // If someone "tidies" these into literals, the three assertions above fire —
    // but they would also fire if the lazy path were simply deleted, which would
    // break DUMMY_MODE. This is the assertion that distinguishes the two.
    expect(source).toMatch(/const\s+\w+\s*=\s*["']@electric-sql\/pglite["']/);
    expect(source).toMatch(/const\s+\w+\s*=\s*["']drizzle-orm\/pglite["']/);
    expect(source).toMatch(/require\(\s*PGLITE\s*\)/);
    expect(source).toMatch(/require\(\s*DRIZZLE_PGLITE\s*\)/);
  });

  it("resolves the subpath extensions through the same variable", () => {
    // These were already correct; asserting them stops a future edit from
    // "simplifying" one of them into a literal while fixing something else.
    expect(source).toMatch(/require\(`\$\{PGLITE\}\/contrib\/pg_trgm`\)/);
    expect(source).toMatch(/require\(`\$\{PGLITE\}\/contrib\/unaccent`\)/);
  });
});

describe("no other file in the database layer imports PGlite directly", () => {
  // `lib/db/index.ts` is the only module allowed to touch it at all. A new
  // module importing it would reintroduce the leak by a different route, and
  // the file-level test above would not notice.
  const FILES = [
    "lib/db/dummy-dir.ts",
    "lib/db/dev-offline.ts",
    "lib/db/slow-query.ts",
    "lib/db/destructive-sql.ts",
  ];

  for (const file of FILES) {
    it(`${file} knows nothing about PGlite`, () => {
      const source = valueSideOf(file);
      for (const spec of TRAPPED) {
        expect(source).not.toContain(spec);
      }
    });
  }
});

describe("the leak detector can see what it claims to see", () => {
  // A test whose pattern silently stops matching passes forever. These pin the
  // pattern against strings built to look like the real thing, so a regexp that
  // breaks fails HERE rather than going quietly green.

  const pattern = new RegExp(`import\\(\\s*["']@electric-sql\\/pglite["']\\s*\\)`);

  it("matches the literal specifier webpack actually emitted", () => {
    // Verbatim from the 2026-09-18 build output.
    expect('a.exports=import("@electric-sql/pglite")').toMatch(pattern);
  });

  it("would ALSO match a type-only reference — which is why the stripper exists", () => {
    const raw = 'x = typeof import("@electric-sql/pglite")';
    expect(raw, "naive match").toMatch(pattern);
    // …and is gone once erased, so the real assertions above are not vacuous
    // in the other direction (forbidding the approved idiom along with the bug).
    expect(raw.replace(/typeof\s+import\([^)]*\)/g, "ERASED_TYPE")).not.toMatch(pattern);
  });

  it("does not match a variable-held specifier", () => {
    // The approved hiding idiom, which must NOT be flagged.
    expect('const PGLITE = "@electric-sql/pglite";').not.toMatch(pattern);
    expect("require(PGLITE)").not.toMatch(pattern);
  });
});
