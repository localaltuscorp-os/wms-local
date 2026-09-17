import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { contentDispositionAttachment } from "@/lib/hr/forms/filename";
import { canExportHrRecords } from "@/lib/hr/records-export/access";
import { collectRecordEntries, resolveExportSubject } from "@/lib/hr/records-export/collect";
import { personFolderName, zipFileName } from "@/lib/hr/records-export/names";
import { buildZip, type ZipInput } from "@/lib/hr/records-export/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

/**
 * GET /api/hr/records/<personId>/zip — one person's complete HR record.
 *
 *   <Name (email)>/Forms/…       every filled form, as PDF
 *   <Name (email)>/Documents/…   scanned documents
 *   <Name (email)>/Letters/…     letters and agreements
 *
 * The same files, names and folders the scheduled Google Drive save writes.
 * `personId` is an HR Record person id: an employee id, or a candidate-intake id
 * that resolves to one.
 *
 * Errors are JSON (never a redirect), because the caller is `fetch` and would
 * otherwise save an HTML page as the ZIP. "Nothing on file" is an answer, not a
 * failure, so it comes back 200 like the docket's "No signed documents yet".
 * One unreadable file does not sink the download: it is listed in
 * "_Files that could not be included.txt" instead.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ personId: string }> }): Promise<Response> {
  const me = await requireUser();
  if (!(await canExportHrRecords(me))) {
    return jsonError("Only HR admins can download a person's complete records.", 403);
  }
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return jsonError(limited.error, 429);

  const { personId } = await ctx.params;
  if (!UUID_RE.test(personId)) return jsonError("Unknown person.", 404);

  const subject = await resolveExportSubject(personId);
  if (!subject) return jsonError("This person isn't linked to an employee account yet, so there is nothing on file.", 200);

  let entries;
  try {
    entries = await collectRecordEntries(subject);
  } catch (err) {
    console.error("[hr/records/zip] collect failed", err);
    return jsonError("Couldn't read this person's records right now. Try again in a minute.", 500);
  }
  if (entries.length === 0) return jsonError(`No forms or documents are on file for ${subject.name} yet.`, 200);

  const root = personFolderName(subject.name, subject.email);
  const files: ZipInput[] = [];
  const missing: string[] = [];
  for (const entry of entries) {
    try {
      const data = await entry.load();
      if (!data) throw new Error("not found in storage");
      files.push({ path: `${root}/${entry.folder}/${entry.name}`, data });
    } catch (err) {
      missing.push(`${entry.folder}/${entry.name} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (files.length === 0) {
    return jsonError(`None of ${subject.name}'s ${entries.length} file(s) could be read from storage right now.`, 502);
  }
  if (missing.length) {
    // BOM so Notepad opens it as UTF-8 (names can carry non-ASCII characters).
    const note = `﻿These files are on record for ${subject.name} but could not be read when this ZIP was made:\r\n\r\n${missing.join("\r\n")}\r\n`;
    files.push({ path: `${root}/_Files that could not be included.txt`, data: new TextEncoder().encode(note) });
  }

  console.info("[hr/records/zip] exported", { by: me.id, person: subject.id, files: files.length, missing: missing.length });

  const zip = buildZip(files);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-length": String(zip.byteLength),
      "content-disposition": contentDispositionAttachment(zipFileName(subject.name)),
      "cache-control": "private, no-store",
    },
  });
}
