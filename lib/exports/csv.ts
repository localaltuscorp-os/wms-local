import { stringify } from "csv-stringify/sync";

export const MAX_EXPORT_ROWS = 10_000;
export const EXPORT_TOO_LARGE = "export_too_large";

interface CsvResponseInput {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

export function csvResponse(input: CsvResponseInput): Response {
  if (input.rows.length > MAX_EXPORT_ROWS) {
    return Response.json(
      { error: EXPORT_TOO_LARGE, cap: MAX_EXPORT_ROWS, totalRows: input.rows.length },
      { status: 422 },
    );
  }

  // UTF-8 BOM so Excel opens correctly; csv-stringify handles quoting per RFC 4180.
  const body = "﻿" + stringify([input.headers, ...input.rows.map(normalizeRow)]);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${input.filename}"`,
      "cache-control": "no-store",
    },
  });
}

function normalizeRow(row: (string | number | null | undefined)[]): (string | number)[] {
  return row.map((v) => {
    if (v === null || v === undefined) return "";
    return v;
  });
}

export function exportFilename(resource: string, date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `altus-corp-${resource}-${iso}.csv`;
}
