/**
 * Which uploaded files a browser can safely SHOW rather than download.
 *
 * Client-SAFE on purpose (no `server-only`): the attachment cell asks the same
 * question the serving route does — "will a tab render this?" — and one answer
 * is what keeps a button labelled "View" from producing a download.
 *
 * AN ALLOW-LIST, NOT A DENY-LIST, and that direction is the security decision.
 * Uploads are already filtered by the shared deny-list in lib/hr/upload.ts,
 * which blocks .html/.svg and executables precisely because they can run script
 * from the storage origin. This list is the second gate: a type nobody put on
 * it is served as an octet-stream download, so a format that turns out to be
 * scriptable later is inert here until somebody deliberately adds it.
 *
 * THE MIME IS OURS, NOT THE UPLOADER'S. Everything below is keyed off the file
 * EXTENSION and mapped to a type this module chose. The browser is never told
 * to trust `file.type` from the upload — that string is attacker-controlled,
 * and "trust the client's Content-Type" is how an inline viewer becomes stored
 * XSS. Note CSV and Markdown deliberately resolve to text/plain rather than
 * text/csv or text/markdown: plain text is the one thing certain not to render.
 */
const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",

  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",

  txt: "text/plain; charset=utf-8",
  csv: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  log: "text/plain; charset=utf-8",
};

/** The lower-cased extension of a name or path, without the dot. */
function extensionOf(nameOrPath: string): string {
  const base = nameOrPath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

/**
 * The Content-Type to serve this file inline as, or null when it should be
 * downloaded instead.
 */
export function previewContentType(nameOrPath: string): string | null {
  return PREVIEW_CONTENT_TYPES[extensionOf(nameOrPath)] ?? null;
}

/** Will a tab render this file? Drives the View / Download label on the row. */
export function isPreviewable(nameOrPath: string): boolean {
  return previewContentType(nameOrPath) !== null;
}

/** True for the one type worth calling out by name in a tooltip. */
export function isPdf(nameOrPath: string): boolean {
  return extensionOf(nameOrPath) === "pdf";
}
