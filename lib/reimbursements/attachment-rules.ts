/**
 * WHAT MAY BE ATTACHED TO A REIMBURSEMENT, and how its object path is shaped.
 *
 * Pure and client-safe so the picker can refuse a bad file before uploading it
 * AND the server can refuse the same file again. The client copy is a courtesy;
 * the server copy is the control. Neither trusts `file.type`, which is supplied
 * by the browser — see `extensionAllowed`.
 */

/** 25 MB, matching the app's other document surfaces (lib/hr/upload.ts). */
export const CLAIM_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** At most this many documents per claim — a bill, not an album. */
export const CLAIM_MAX_FILES = 10;

/**
 * The allowed types, keyed by EXTENSION.
 *
 * AN ALLOW-LIST, and keyed off the extension rather than the browser-supplied
 * MIME, because that is the direction that fails safe: a type nobody listed
 * here is refused, and a client that lies about `file.type` cannot talk its way
 * past the check. The MIME is recorded for display, never trusted for control.
 *
 * The values are the types WE consider each extension to be.
 */
const ALLOWED: Record<string, string> = {
  // Images — a photo of a bill is the common case.
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  // PDF — the other common case.
  pdf: "application/pdf",
  // Word.
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The `accept` attribute for the file input, derived from the allow-list. */
export const CLAIM_ACCEPT_ATTR = [
  ...Object.keys(ALLOWED).map((e) => `.${e}`),
  "image/*",
  "application/pdf",
].join(",");

/** Human list for the hint under the picker. */
export const CLAIM_ALLOWED_LABEL = "JPG, PNG, WEBP, GIF, HEIC, PDF, DOC, DOCX";

/** The lower-cased extension of a file name, without the dot. */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

/** Is this extension one we accept? */
export function extensionAllowed(name: string): boolean {
  return extensionOf(name) in ALLOWED;
}

/** The type WE consider this file to be, from its extension. Null if refused. */
export function resolvedMimeFor(name: string): string | null {
  return ALLOWED[extensionOf(name)] ?? null;
}

/** Will a browser tab render this inline (image / PDF), or must it download? */
export function isInlineViewable(name: string): boolean {
  const ext = extensionOf(name);
  return ext === "pdf" || (resolvedMimeFor(name)?.startsWith("image/") ?? false);
}

/** Is this an image we can show a thumbnail of? HEIC is excluded — see below. */
export function isThumbnailable(name: string): boolean {
  const ext = extensionOf(name);
  // HEIC/HEIF are images but no major browser renders them in an <img>, so a
  // thumbnail would be a broken-image icon. They stay a download.
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
}

/**
 * Filename → safe object-key segment. Never used for DISPLAY (the original name
 * is stored verbatim on the row for that).
 *
 * STRICTER THAN `safeFileName` in lib/hr/upload.ts, deliberately, because `.`
 * is in the permitted character set and that leaves two holes there:
 *
 *   · A name of "." or ".." survives intact and becomes a RELATIVE path segment
 *     — `…/<uuid>/..` resolves back up to `…/<uuid>`, i.e. not the key we
 *     minted. Leading dots are stripped so no segment can be a dot-run.
 *   · A name made only of disallowed characters ("???") collapses to "_", which
 *     is truthy, so the `|| "file"` fallback never fires and the object is
 *     keyed on a bare underscore. Underscore-only results fall back too.
 *
 * The HR helper is left alone — it is shared by other surfaces and changing it
 * is not this change's business.
 */
export function safeObjectName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    // Collapse runs, then strip leading dots/underscores/dashes so the segment
    // can never be a dot-run, a hidden file, or an option-looking string.
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 120);
  // Anything left that carries no letter or digit is not a usable name.
  return /[a-zA-Z0-9]/.test(cleaned) ? cleaned : "file";
}

/** "1.4 MB" */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export type FileCheck = { ok: true } | { ok: false; error: string };

/**
 * Vet one file by name and size. Shared by the picker and the two server
 * actions, so all three refuse exactly the same set.
 */
export function checkClaimFile(input: { name: string; size: number }): FileCheck {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "That file has no name." };
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: `“${name}” is empty.` };
  }
  if (input.size > CLAIM_FILE_MAX_BYTES) {
    return { ok: false, error: `“${name}” is larger than 25 MB.` };
  }
  if (!extensionAllowed(name)) {
    return { ok: false, error: `“${name}” is not a supported type. Use ${CLAIM_ALLOWED_LABEL}.` };
  }
  return { ok: true };
}

/** The storage prefix every claim document of one employee lives under. */
export function claimObjectPrefix(employeeId: string): string {
  return `reimbursements/${employeeId}`;
}

/**
 * The employee id embedded in a claim object path, or null if the path is not
 * one of ours.
 *
 * THE SERVER-SIDE OWNERSHIP CHECK. The path is minted server-side, but it
 * travels through the browser before coming back on submit, so it has to be
 * re-validated: without this a client could echo back a path under someone
 * else's prefix and staple another employee's receipt onto their own claim.
 */
export function employeeIdFromClaimPath(path: string): string | null {
  const m = /^reimbursements\/([0-9a-f-]{36})\/[^/]+\/[^/]+$/i.exec(path);
  return m?.[1] ?? null;
}

/**
 * WHAT SHAPE IS A LEGACY `bill_url`?
 *
 * The field predates uploads and holds two different things depending on which
 * client filed the claim:
 *
 *   · "url"  — an external http(s) link, from the old web "Bill / Receipt Link"
 *              field. Usually Google Drive. Opens directly.
 *   · "path" — an object key in the PRIVATE `documents` bucket, from the Android
 *              app, which uploads via /api/mobile/storage/sign and stores the
 *              path it got back. NOT openable as a URL: prefixing it with
 *              "https://" — which the claim card used to do for anything not
 *              starting with http — produces "https://<employee-uuid>/bill.jpg"
 *              and a dead link. It has to be signed server-side.
 *
 * Returns null for an empty value.
 */
export function legacyBillKind(value: string | null | undefined): "url" | "path" | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return "url";
  // A mobile upload is "<employeeId>/…"; anything else with a slash and no
  // scheme is treated as a path too, since it is certainly not a usable URL.
  return v.includes("/") ? "path" : "url";
}
