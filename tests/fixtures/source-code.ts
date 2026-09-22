import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * READ A SOURCE FILE WITH ITS COMMENTS REMOVED.
 *
 * ── WHY A TEST HELPER NEEDS THIS ───────────────────────────────────────────
 * Several tests assert structural properties of the code itself — "this module
 * reads no environment variable", "this action does not use
 * `getCurrentEmployee`", "the hardcoded product array is gone". Those are real,
 * checkable guarantees, and asserting them on the raw file text does not work in
 * this repository, because it comments heavily and the comments discuss exactly
 * the things being forbidden.
 *
 * `lib/security/capabilities.ts` explains at length why its `NODE_ENV` escape
 * hatch was removed. `lib/forms/server.ts` explains why `DEFAULT_PRODUCT_OPTIONS`
 * was deleted. A prose mention of a forbidden identifier is evidence FOR the
 * property, not against it — so matching it inverts the test.
 *
 * ── DELIBERATELY A STRIPPER, NOT A PARSER ──────────────────────────────────
 * It handles `//`, block comments, and the three quote styles with escapes,
 * which is everything the files under test contain. It does NOT understand
 * regex literals — a `//` inside one would be read as a line comment. No caller
 * needs that today; if one ever does, the answer is a real parser, not a
 * cleverer regex here.
 *
 * Newlines inside stripped comments are preserved so reported offsets stay
 * roughly aligned with the real file.
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  type Mode = "code" | "line" | "block" | "'" | '"' | "`";
  let mode: Mode = "code";

  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];

    if (mode === "code") {
      if (c === "/" && next === "/") {
        mode = "line";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        mode = "block";
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        mode = c;
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        out += c;
      }
      i += 1;
      continue;
    }

    if (mode === "block") {
      if (c === "*" && next === "/") {
        mode = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += c;
      i += 1;
      continue;
    }

    // Inside a string literal: copy verbatim, honouring escapes, and close on
    // the matching quote.
    if (c === "\\") {
      out += c + (next ?? "");
      i += 2;
      continue;
    }
    out += c;
    if (c === mode) mode = "code";
    i += 1;
  }

  return out;
}

/**
 * A repo-relative source file, comments removed and line endings NORMALISED.
 *
 * The normalisation is not cosmetic. Every caller asserts on a snippet written
 * in a test file with LF newlines in it, but this repository is checked out
 * with `core.autocrlf=true`, so on Windows the file on disk has CRLF and a
 * multi-line `toContain` never matches. The test then fails for the developer
 * and passes in CI, which is the worst way round: it reports the checkout
 * rather than the code. Reading both the same way is what makes these
 * assertions mean what they say on either platform.
 */
export function codeOf(relPath: string): string {
  const raw = readFileSync(join(process.cwd(), relPath), "utf8");
  return stripComments(raw.split("\r\n").join("\n"));
}
