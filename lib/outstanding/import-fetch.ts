/**
 * Pure helper: turn a Google Sheets *share* URL into the public CSV-export URL
 * for one tab. NO IO — just string parsing. The server action does the fetch.
 *
 *   https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
 *   https://docs.google.com/spreadsheets/d/<ID>/edit?gid=<GID>
 *     → https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>
 *
 * When no gid is present the export URL omits the gid param (Google then serves
 * the first tab). Returns null for anything that isn't a Google Sheets URL.
 */
export function sheetCsvUrl(shareUrl: string): string | null {
  const raw = (shareUrl ?? "").trim();
  if (!raw) return null;

  // Must be a Google Sheets spreadsheet URL; reject docs/slides/other hosts.
  const idMatch = raw.match(
    /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (!idMatch) return null;
  const id = idMatch[1]!;

  // gid can appear as #gid=N or ?gid=N (or &gid=N). First match wins.
  const gidMatch = raw.match(/[#?&]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : null;

  const base = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : base;
}
