import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * NO UNRESOLVED MERGE CONFLICTS ANYWHERE IN THE SOURCE (spec §14).
 *
 * A conflict marker is not a style problem — `db/schema.ts` carried one, and
 * every module that imports the schema (which is the entire salary engine)
 * failed to parse because of it. The typecheck catches that for TypeScript, but
 * markers in a `.sql` migration or in `globals.css` fail silently at a much
 * worse moment, so this sweeps every source extension rather than trusting the
 * compiler to have opinions about all of them.
 *
 * Scoped to the directories that hold hand-written source. `node_modules` and
 * `.next` are excluded because a vendored fixture containing the string is not
 * this repository's problem.
 */

const ROOT = path.resolve(__dirname, "../..");

/**
 * THE WHOLE REPOSITORY, not a list of source directories.
 *
 * A directory-scoped sweep is how two of these were missed in the first place:
 * `vercel.json` at the root carried a marker that broke the cron schedule as
 * INVALID JSON, and `design-system/goals-module-audit.md` carried a whole-file
 * one. Neither is in `app/` or `lib/`, and neither would have failed a
 * typecheck. Walking from the root and excluding the generated directories is
 * the only version of this check that cannot have a blind spot.
 */
const SEARCH_ROOT = ROOT;

const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".sql",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".example",
]);

/**
 * Files with no useful extension that still must be checked.
 *
 * `.env.example` matches on `.example` above, but a plain `.env`-style or
 * `Dockerfile`-style name has no extension at all and an extension-driven walk
 * skips it silently. Both of the misses this test was widened for were exactly
 * this shape of blind spot, so the exact names are listed rather than assumed.
 */
const EXTENSIONLESS = new Set(["Dockerfile", "Procfile", ".npmrc", ".nvmrc", ".firebaserc"]);

function isChecked(name: string): boolean {
  return EXTENSIONS.has(path.extname(name)) || EXTENSIONLESS.has(name);
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".pglite",
  "dist",
  "build",
  ".turbo",
  "android-app",
  "public",
]);

/**
 * The markers, built at runtime from their halves.
 *
 * Written this way ON PURPOSE: spelled out as literals, THIS FILE would match
 * its own test and the suite would fail on itself.
 */
const MARKERS = ["<".repeat(7), "=".repeat(7), ">".repeat(7)];

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // a directory this checkout does not have is not a failure
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(full);
    else if (isChecked(name)) yield full;
  }
}

/** Every line that OPENS, divides or closes a conflict, with its location. */
function conflictsIn(file: string): string[] {
  const text = readFileSync(file, "utf8");
  // Cheap reject first: most files contain none of the three.
  if (!MARKERS.some((m) => text.includes(m))) return [];
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    // ONLY at the start of a line, which is where git writes them. A `=======`
    // rule inside a comment banner is extremely common in this codebase and is
    // not a conflict; requiring the line to START with the marker and, for the
    // two angled ones, to be followed by a space or end-of-line, tells them
    // apart without false alarms.
    for (const m of MARKERS) {
      if (!line.startsWith(m)) continue;
      const rest = line.slice(m.length);
      const isMarker = m[0] === "=" ? rest.trim() === "" : rest === "" || rest.startsWith(" ");
      if (isMarker) {
        out.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.slice(0, 60)}`);
      }
    }
  }
  return out;
}

describe("the repository has no unresolved merge conflicts", () => {
  it("no source file contains a conflict marker", () => {
    const found: string[] = [];
    for (const file of walk(SEARCH_ROOT)) {
      // This file describes the markers; it can never be a conflict itself.
      if (path.basename(file) === "no-merge-conflicts.test.ts") continue;
      found.push(...conflictsIn(file));
    }
    expect(found).toEqual([]);
  });

  it("actually looks at a meaningful number of files", () => {
    // A guard on the guard: a broken walk would report "no conflicts" over an
    // empty set and look exactly like success.
    let n = 0;
    for (const _ of walk(SEARCH_ROOT)) n++;
    expect(n).toBeGreaterThan(500);
  });
});
