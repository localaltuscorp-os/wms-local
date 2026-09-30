/**
 * Naming and redaction rules for the module backup — pure, so a test can import
 * them. (The files that use them are `server-only`, which vitest cannot load.)
 */

/**
 * COLUMNS THAT NEVER LEAVE THE BUILDING, whatever a module declares.
 *
 * Every match is a live credential: the encrypted portal passwords in the
 * Accounts vault and the vendor list, Google refresh tokens, and the hashes
 * standing in for a signature link, a device, a delegated session or a sign-in
 * code. An export is a file that gets emailed around; none of this travels
 * with it.
 *
 * Matched on the column NAME, so a table added next year with a column called
 * `password_enc` is covered without anybody remembering this file exists.
 */
const NEVER_EXPORT = [
  /password/i,
  /token/i,
  /secret/i,
  /public_key/i,
  /credential/i,
  /_enc$/i,
];

export function isSecretColumn(name: string): boolean {
  return NEVER_EXPORT.some((re) => re.test(name));
}

/** Excel refuses a sheet name over 31 characters, or containing : \ / ? * [ ] */
export function safeSheetName(name: string, taken: Set<string>): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  if (!taken.has(cleaned)) {
    taken.add(cleaned);
    return cleaned;
  }
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = cleaned.slice(0, 31 - suffix.length) + suffix;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** File names inside one folder must be unique, whatever the rows called them. */
export function uniqueFileName(name: string, taken: Set<string>): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "file";
  if (!taken.has(clean)) {
    taken.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

function fileExtension(path: string): string {
  const leaf = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 && dot < leaf.length - 1 ? leaf.slice(dot) : "";
}

function datePart(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

/**
 * Give copied backup files a human-readable name without changing their bytes.
 * A real uploaded filename wins; generated names describe the content and date
 * instead of exposing the UUID/object key used by storage.
 */
export function backupFileName(input: {
  path: string;
  uploadedName?: unknown;
  label: string;
  details?: readonly unknown[];
  date?: unknown;
}): string {
  const ext = fileExtension(input.path);
  const uploaded = typeof input.uploadedName === "string" ? input.uploadedName.trim() : "";
  if (uploaded) {
    return fileExtension(uploaded) || !ext ? uploaded : `${uploaded}${ext}`;
  }

  const details = (input.details ?? [])
    .filter((value): value is string | number =>
      (typeof value === "string" && Boolean(value.trim())) || typeof value === "number",
    )
    .map((value) => String(value).trim());
  const date = datePart(input.date);
  return [...details, input.label, ...(date ? [date] : [])].join(" - ") + ext;
}

/**
 * The dated folder inside a module's folder: "2026-09-21 03-05".
 *
 * IST, not UTC: the run starts at 03:05 IST, which is the previous day in UTC,
 * and a folder named with yesterday's date for tonight's save would be read
 * wrong by everyone who opens it.
 */
export function folderNameFor(until: Date): string {
  const ist = new Date(until.getTime() + (5 * 60 + 30) * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())} ${p(ist.getUTCHours())}-${p(ist.getUTCMinutes())}`;
}
