/**
 * Download filename for a filled form, and the header that carries it.
 *
 * PURE and in its own module rather than inside `load.ts`, which imports the DB
 * client and opens a connection at module load — nothing that only needs to
 * build a string should have to pay for that, and it makes this testable.
 */

/**
 * Characters that break a `Content-Disposition` value or a filesystem path:
 * C0/C7 controls (which is where `\n` and `\r` live — a newline in a header is
 * the header-injection case), path separators, and the Windows-reserved set.
 *
 * Note what is NOT here: letters outside ASCII. `[^\w\s.-]`, the obvious
 * strip-everything-unusual class, deletes every Devanagari, Tamil or accented
 * character — so an employee whose name is written in their own script used to
 * download `Exit Interview - .pdf`. Non-ASCII is a header ENCODING problem, and
 * `contentDispositionAttachment` below solves it as one.
 */
const UNSAFE_IN_FILENAME = /[\u0000-\u001f\u007f\\/:*?"<>|]+/g;

/** Clean one component: strip the unsafe set, collapse runs of whitespace, and
 *  refuse leading/trailing dots (a leading dot is a hidden file, and `..` on its
 *  own is a path segment). */
function cleanPart(part: string): string {
  return part
    .replace(UNSAFE_IN_FILENAME, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

/**
 * `Exit Interview - Jane Doe.pdf`.
 *
 * The separator is only joined between parts that SURVIVED cleaning, so a name
 * that reduces to nothing yields `Exit Interview.pdf` rather than a dangling
 * `Exit Interview - .pdf`, and two empty parts fall back rather than producing
 * the bare `-.pdf` the naive join gave.
 */
export function submissionFilename(formName: string, employeeName: string): string {
  const parts = [formName, employeeName].map(cleanPart).filter(Boolean);
  return `${parts.join(" - ") || "filled-form"}.pdf`;
}

/**
 * A complete `Content-Disposition` value for a PDF download.
 *
 * RFC 6266: send BOTH forms. `filename` is the ASCII-only fallback every client
 * understands; `filename*` carries the real UTF-8 name, so a name in a non-Latin
 * script arrives intact instead of being deleted for the crime of not being
 * ASCII. Modern browsers prefer `filename*` and ignore the fallback.
 */
export function contentDispositionAttachment(filename: string): string {
  // Build the fallback from the STEM and re-attach the extension, so a name that
  // is entirely non-ASCII degrades to `filled-form.pdf` rather than the bare
  // `.pdf` a straight strip leaves — which is an extension with no filename, and
  // a hidden file on unix. `[^\x20-\x7e]` also covers control characters, so the
  // newline case is handled here as well as in `submissionFilename`.
  const ext = /\.[a-z0-9]+$/i.exec(filename)?.[0] ?? "";
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  const asciiStem = stem
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    // Trim the separator debris left behind when a stripped part sat next to it.
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .trim();
  const ascii = asciiStem ? `${asciiStem}${ext}` : `filled-form${ext || ".pdf"}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
