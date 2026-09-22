/**
 * WORK SAMPLES — the optional "show us your work" block on the Candidate
 * Interview Form's Personal Details step (asked 2026-09-18): any number of
 * links (portfolio, GitHub, Behance, a Drive folder) and uploaded files
 * (images, PDFs, documents).
 *
 * Stored as ONE answer key, `personal.workSamples`, holding a JSON array. It is
 * not a schema field on purpose - the schema's field types are shared with the
 * generic form renderer and the form builder, and nothing about a file list
 * fits them - so `isRequiredField` never sees it and it can never block a
 * submit. Being an ordinary answer, it autosaves and resumes with the draft.
 *
 * PURE: shared by the wizard (browser), the save/upload actions (server) and
 * the HR forms index, so all three agree on what a valid entry is.
 */

export const WORK_SAMPLES_KEY = "personal.workSamples";

export type WorkSampleLink = { kind: "link"; url: string };
export type WorkSampleFile = { kind: "file"; path: string; name: string; size: number; mime: string | null };
export type WorkSample = WorkSampleLink | WorkSampleFile;

/** Enough for a real portfolio, few enough that one form can't become a file dump. */
export const WORK_SAMPLES_MAX = 20;
export const WORK_FILE_MAX_BYTES = 25 * 1024 * 1024;
/** What the file picker offers. The server check below is what actually decides. */
export const WORK_FILE_ACCEPT =
  "image/*,application/pdf,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.txt,.rtf,.csv,.zip";

// Executables and anything a browser would run or render as a page. Same list
// as the onboarding attachments (lib/dossier/onboarding-submit.ts).
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/x-msdownload",
  "application/x-sh",
  "application/x-shellscript",
]);

/** Why a file can't be attached, or null when it can. */
export function workFileProblem(input: { name: string; mime?: string | null; size?: number | null }): string | null {
  const name = String(input.name ?? "");
  const mime = String(input.mime ?? "").toLowerCase();
  if (!name.trim()) return "That file has no name.";
  if (DISALLOWED_EXTENSIONS.test(name) || (mime && DISALLOWED_MIME.has(mime))) return "That file type is not allowed.";
  if (Number(input.size ?? 0) > WORK_FILE_MAX_BYTES) return "That file is over 25 MB.";
  return null;
}

/** A storage-safe file name (the object key's last segment). */
export function safeWorkFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/**
 * Normalise a typed link: trims, adds https:// to a bare "github.com/me", and
 * accepts only http(s). Returns null for anything else (javascript:, mailto:,
 * a stray word) - a link HR clicks must go to a web page and nowhere stranger.
 */
export function normaliseWorkLink(raw: string): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

/** Parse the stored JSON. Anything malformed is dropped, never thrown. */
export function parseWorkSamples(raw: string | null | undefined): WorkSample[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: WorkSample[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (o.kind === "link" && typeof o.url === "string") {
      const url = normaliseWorkLink(o.url);
      if (url) out.push({ kind: "link", url });
    } else if (o.kind === "file" && typeof o.path === "string" && o.path) {
      out.push({
        kind: "file",
        path: o.path.slice(0, 400),
        name: String(o.name ?? "file").slice(0, 200),
        size: Number(o.size) || 0,
        mime: typeof o.mime === "string" ? o.mime : null,
      });
    }
    if (out.length >= WORK_SAMPLES_MAX) break;
  }
  return out;
}

export function serialiseWorkSamples(items: WorkSample[]): string {
  return items.length ? JSON.stringify(items.slice(0, WORK_SAMPLES_MAX)) : "";
}

/**
 * Keep only files stored under `prefix` (links always pass). A candidate saves
 * their own answers, so a crafted value could otherwise point HR's "open file"
 * at someone else's upload.
 */
export function workSamplesUnder(raw: string | null | undefined, prefix: string): string {
  return serialiseWorkSamples(parseWorkSamples(raw).filter((s) => s.kind === "link" || s.path.startsWith(prefix)));
}

/** Is this a path a work-sample file may live at? (the view action's guard) */
export function isWorkSamplePath(path: string): boolean {
  return /^candidate-intake\/(?:work\/[0-9a-f-]{36}|[0-9a-f-]{36}\/work-[0-9a-f-]{36})\/[a-zA-Z0-9._-]+$/.test(path);
}

/** One line per sample, for the HR forms index / emailed PDF. */
export function describeWorkSamples(raw: string | null | undefined): string {
  return parseWorkSamples(raw)
    .map((s) => (s.kind === "link" ? s.url : `${s.name} (file)`))
    .join("\n");
}
