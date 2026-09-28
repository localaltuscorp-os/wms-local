// Shared upload guards for HR file surfaces (policies, letters). Mirrors the
// dossier / document-library deny-list: block executables + inline-renderable
// types that could run script from the signed-URL storage domain.

export const HR_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME_TYPES = new Set<string>([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-shellscript",
  "text/x-shellscript",
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

export function validateUpload(file: File): { ok: true } | { ok: false; error: string } {
  return validateUploadMeta({ fileName: file.name, mime: file.type || null, size: file.size });
}

/**
 * The same rules, stated over METADATA rather than a `File`.
 *
 * The direct-to-Supabase upload flow mints its signed URL on the SERVER, which
 * never sees the bytes — only the name, type and size the browser claims. It
 * still has to apply the deny-list, because the browser's own check is advice
 * and the request can be replayed without it.
 *
 * `validateUpload` now delegates here so the two cannot diverge: the deny-list
 * had already been copy-pasted into three other modules, and a fourth copy is
 * how one of them ends up allowing `.svg` after everyone else stops.
 */
export function validateUploadMeta(meta: {
  fileName: string;
  mime?: string | null;
  size?: number | null;
}): { ok: true } | { ok: false; error: string } {
  const size = Number(meta.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "Pick a file to upload." };
  if (size > HR_UPLOAD_MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  if (DISALLOWED_EXTENSIONS.test(meta.fileName)) return { ok: false, error: "This file type is not allowed." };
  if (meta.mime && DISALLOWED_MIME_TYPES.has(meta.mime)) {
    return { ok: false, error: "This file type is not allowed." };
  }
  return { ok: true };
}
