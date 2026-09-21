import "server-only";
import { getObjectBytes } from "@/lib/storage/objects";
import { buildZip, type ZipInput } from "@/lib/hr/records-export/zip";
import { moduleBackup } from "./registry";
import { buildWorkbook, type SheetInput } from "./workbook";
import { uniqueFileName } from "./names";
import { moduleState } from "./settings";

/**
 * THE EXPORT BUTTON — a module's data as a ZIP, built now and sent to the
 * browser: the workbook, plus the files its rows point at, in one archive.
 *
 * ── WHY THERE IS A CEILING ─────────────────────────────────────────────────
 * This runs inside one request, holding the archive in memory. A module with
 * years of scans would run the function out of memory and give the person a
 * failed download with no explanation. So the files stop at a limit and the
 * workbook still lists every row, with a line on the cover saying what was left
 * out and where to find it — the nightly Drive save carries everything.
 */

/** Total attachment bytes a single download will carry. */
const MAX_FILE_BYTES = 120 * 1024 * 1024;
/** And a count, so thousands of tiny files cannot make an unusable archive. */
const MAX_FILES = 1_500;

export interface DownloadResult {
  bytes: Uint8Array;
  fileName: string;
  truncatedFiles: number;
}

export async function buildModuleDownload(args: {
  moduleId: string;
  /** "all" ignores the watermark; "new" takes only what the nightly save has not sent. */
  scope: "all" | "new";
}): Promise<DownloadResult> {
  const def = moduleBackup(args.moduleId);
  if (!def) throw new Error(`No export is defined for module ${args.moduleId}`);

  const state = await moduleState(args.moduleId);
  const since = args.scope === "new" ? state.exportedThrough : null;
  const until = new Date();

  const sheets: SheetInput[] = [];
  const zipFiles: ZipInput[] = [];
  const usedNames = new Set<string>();
  let bytesSoFar = 0;
  let truncatedFiles = 0;

  for (const dataset of def.datasets) {
    const data = await dataset.rows({ since: dataset.changes === "snapshot" ? null : since });
    const names: string[] = [];
    for (const file of data.files ?? []) {
      const name = uniqueFileName(file.name, usedNames);
      names.push(name);
      if (zipFiles.length >= MAX_FILES || bytesSoFar >= MAX_FILE_BYTES) {
        truncatedFiles++;
        continue;
      }
      const bytes = await getObjectBytes(file.bucket, file.path).catch(() => null);
      if (!bytes) {
        truncatedFiles++;
        continue;
      }
      bytesSoFar += bytes.byteLength;
      zipFiles.push({ path: `${def.label}/Files/${name}`, data: bytes, modified: until });
    }
    sheets.push({ tab: dataset.tab, data, fileNames: names });
  }

  const xlsx = await buildWorkbook({ moduleLabel: def.label, since, until, sheets });
  const stamp = until.toISOString().slice(0, 10);
  zipFiles.unshift({
    path: `${def.label}/${def.label} ${stamp}.xlsx`,
    data: xlsx,
    modified: until,
  });

  if (truncatedFiles > 0) {
    // Say it inside the archive as well as in the response header: whoever
    // opens this a month from now will not have the header.
    const note =
      `${truncatedFiles} file(s) are not in this download.\r\n\r\n` +
      `A single download carries at most ${MAX_FILES} files or ` +
      `${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB. Every row is still listed in the ` +
      `workbook, and the nightly save to Google Drive carries the complete set.\r\n`;
    zipFiles.push({
      path: `${def.label}/Files not included.txt`,
      data: new TextEncoder().encode(note),
      modified: until,
    });
  }

  return {
    bytes: buildZip(zipFiles),
    fileName: `${def.label.replace(/[^\w -]/g, "")} ${stamp}.zip`,
    truncatedFiles,
  };
}
