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
  if (file.size === 0) return { ok: false, error: "Pick a file to upload." };
  if (file.size > HR_UPLOAD_MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  if (DISALLOWED_EXTENSIONS.test(file.name)) return { ok: false, error: "This file type is not allowed." };
  if (file.type && DISALLOWED_MIME_TYPES.has(file.type)) return { ok: false, error: "This file type is not allowed." };
  return { ok: true };
}
