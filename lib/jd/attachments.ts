/**
 * SOP FILES ON A JOB DESCRIPTION — what may be attached, and where it lives.
 *
 * Three kinds, one per box on the form (account holder, 2026-09-18: "all 3 in
 * one line, different boxes, multiple file selection, delete"): a VIDEO of how
 * the work is done, the GUIDELINES that govern it, and the TEMPLATES it is done
 * in. Each box takes several files; each file is one `jd_attachments` row.
 *
 * Pure and client-safe, like lib/reimbursements/attachment-rules.ts whose shape
 * it follows: the picker refuses a bad file before uploading it and the server
 * refuses the same file again. The client copy is a courtesy, the server copy is
 * the control, and neither trusts the browser's `file.type`.
 */
import { extensionOf, formatBytes, safeObjectName } from "@/lib/reimbursements/attachment-rules";

export { formatBytes, safeObjectName };

export const JD_ATTACHMENT_KINDS = ["video", "guidelines", "template"] as const;
export type JdAttachmentKind = (typeof JD_ATTACHMENT_KINDS)[number];

export function isJdAttachmentKind(v: unknown): v is JdAttachmentKind {
  return JD_ATTACHMENT_KINDS.includes(v as JdAttachmentKind);
}

/**
 * 25 MB a file. The app's other document surfaces use the same ceiling, and in
 * dummy mode a file travels through a Server Action whose body limit is 25 MB
 * (next.config.ts). A longer training video belongs on YouTube or Drive — the
 * box keeps its link field for exactly that.
 */
export const JD_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** Per box, per job description. A procedure, not an archive. */
export const JD_MAX_FILES_PER_KIND = 10;

const VIDEO: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

const DOCUMENT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const ALLOWED: Record<JdAttachmentKind, Record<string, string>> = {
  video: VIDEO,
  guidelines: DOCUMENT,
  template: DOCUMENT,
};

/** What each box is called and says, in one place for the form and the drawer. */
export const JD_ATTACHMENT_META: Record<JdAttachmentKind, { title: string; hint: string; allowed: string }> = {
  video: { title: "Video", hint: "How to do this work", allowed: "MP4, MOV, M4V, WEBM" },
  guidelines: { title: "Guidelines", hint: "Rules of execution", allowed: "PDF, Word, Excel, PowerPoint, images" },
  template: { title: "Templates", hint: "Standard files", allowed: "PDF, Word, Excel, PowerPoint, images" },
};

/** The `accept` attribute for one box's file input. */
export function jdAcceptAttr(kind: JdAttachmentKind): string {
  return Object.keys(ALLOWED[kind]).map((e) => `.${e}`).join(",");
}

/** The type WE consider this file to be, for this box. Null if refused. */
export function resolvedJdMime(kind: JdAttachmentKind, name: string): string | null {
  return ALLOWED[kind][extensionOf(name)] ?? null;
}

export type JdFileCheck = { ok: true } | { ok: false; error: string };

/** Vet one file by box, name and size — shared by the picker and the server actions. */
export function checkJdFile(kind: JdAttachmentKind, input: { name: string; size: number }): JdFileCheck {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "That file has no name." };
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: `“${name}” is empty.` };
  if (input.size > JD_FILE_MAX_BYTES) return { ok: false, error: `“${name}” is larger than 25 MB.` };
  if (!resolvedJdMime(kind, name)) {
    return { ok: false, error: `“${name}” can't go in ${JD_ATTACHMENT_META[kind].title}. Use ${JD_ATTACHMENT_META[kind].allowed}.` };
  }
  return { ok: true };
}

/** The storage prefix one uploader's JD files live under. */
export function jdObjectPrefix(employeeId: string): string {
  return `jd/${employeeId}`;
}

/**
 * The uploader id embedded in a JD object path, or null if it is not one of ours.
 *
 * THE OWNERSHIP CHECK. The path is minted by the server but travels through the
 * browser before it comes back on save, so it is re-validated: without this a
 * client could echo back somebody else's path and staple their file to its JD.
 */
export function employeeIdFromJdPath(path: string): string | null {
  const m = /^jd\/([0-9a-f-]{36})\/[0-9a-f-]{36}\/[^/]+$/i.exec(path);
  return m?.[1] ?? null;
}

/** An uploaded file, as the browser reports it back for recording. */
export interface JdUploadRef {
  kind: JdAttachmentKind;
  path: string;
  fileName: string;
  size: number;
}

/**
 * Refs → `jd_attachments` rows, or the first reason one is refused.
 *
 * Every ref must be a path THIS uploader was given, in a box that takes its
 * type, within the size limit — the same checks the upload itself passed, run
 * again because the ref came back through the client.
 */
export function buildJdAttachmentRows(
  refs: readonly JdUploadRef[],
  uploaderId: string,
  jdId: string,
):
  | { ok: true; rows: { jdId: string; kind: JdAttachmentKind; storagePath: string; fileName: string; mime: string | null; sizeBytes: number; uploadedById: string }[] }
  | { ok: false; error: string } {
  const rows = [];
  const seen = new Set<string>();
  for (const r of refs) {
    if (!isJdAttachmentKind(r.kind)) return { ok: false, error: "Unknown attachment box." };
    if (employeeIdFromJdPath(r.path) !== uploaderId) return { ok: false, error: "Invalid upload." };
    if (seen.has(r.path)) continue;
    seen.add(r.path);
    const check = checkJdFile(r.kind, { name: r.fileName, size: r.size });
    if (!check.ok) return check;
    rows.push({
      jdId,
      kind: r.kind,
      storagePath: r.path,
      fileName: r.fileName.slice(0, 255),
      mime: resolvedJdMime(r.kind, r.fileName),
      sizeBytes: r.size,
      uploadedById: uploaderId,
    });
  }
  const perKind = new Map<string, number>();
  for (const row of rows) perKind.set(row.kind, (perKind.get(row.kind) ?? 0) + 1);
  for (const [kind, n] of perKind) {
    if (n > JD_MAX_FILES_PER_KIND) {
      return { ok: false, error: `${JD_ATTACHMENT_META[kind as JdAttachmentKind].title} can hold at most ${JD_MAX_FILES_PER_KIND} files.` };
    }
  }
  return { ok: true, rows };
}

/** The route a saved file opens through — it signs a short-lived link per click. */
export function jdAttachmentHref(id: string): string {
  return `/api/jd/attachments/${id}`;
}
