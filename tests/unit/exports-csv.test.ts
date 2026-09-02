import { describe, it, expect } from "vitest";
import { csvResponse, MAX_EXPORT_ROWS, EXPORT_TOO_LARGE, exportFilename } from "@/lib/exports/csv";

describe("csvResponse", () => {
  it("returns 200 + text/csv + attachment disposition + UTF-8 BOM", async () => {
    const res = csvResponse({
      filename: "altus-corp-tasks-2026-05-17.csv",
      headers: ["a", "b"],
      rows: [["1", "2"], ["3", "4"]],
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/altus-corp-tasks-2026-05-17\.csv/);
    // Verify BOM bytes on the wire (Response.text() consumes a leading BOM per the
    // UTF-8 decode spec, so we have to inspect raw bytes — what the browser saves to disk).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.charCodeAt(0)).toBe(0xfeff);     // BOM survives when we tell the decoder to keep it
    expect(text.slice(1)).toMatch(/^a,b\r?\n/);  // header row
    expect(text).toMatch(/1,2/);
    expect(text).toMatch(/3,4/);
  });

  it("returns 422 EXPORT_TOO_LARGE when rows exceed the cap", async () => {
    const rows = Array.from({ length: MAX_EXPORT_ROWS + 1 }, () => ["x"]);
    const res = csvResponse({ filename: "x.csv", headers: ["a"], rows });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; cap: number; totalRows: number };
    expect(body.error).toBe(EXPORT_TOO_LARGE);
    expect(body.cap).toBe(MAX_EXPORT_ROWS);
    expect(body.totalRows).toBe(MAX_EXPORT_ROWS + 1);
  });

  it("escapes commas, quotes, and newlines per RFC 4180", async () => {
    const res = csvResponse({
      filename: "x.csv",
      headers: ["name"],
      rows: [["Vasa, M."], ['"Quoted"'], ["Line\nbreak"]],
    });
    const text = await res.text();
    expect(text).toMatch(/"Vasa, M\."/);
    expect(text).toMatch(/""Quoted""/);
    expect(text).toMatch(/"Line\nbreak"/);
  });

  it("renders null and undefined as empty strings", async () => {
    const res = csvResponse({
      filename: "x.csv",
      headers: ["a", "b", "c"],
      rows: [[null, undefined, 0], ["x", null, undefined]],
    });
    const text = await res.text();
    expect(text).toMatch(/,,0/);
    expect(text).toMatch(/x,,/);
  });

  it("renders numbers without quoting", async () => {
    const res = csvResponse({
      filename: "x.csv",
      headers: ["count"],
      rows: [[42], [3.14]],
    });
    const text = await res.text();
    expect(text).toMatch(/42/);
    expect(text).toMatch(/3\.14/);
    expect(text).not.toMatch(/"42"/);
  });
});

describe("exportFilename", () => {
  it("formats as altus-corp-<resource>-YYYY-MM-DD.csv", () => {
    expect(exportFilename("tasks", new Date("2026-05-17T10:30:00Z"))).toBe(
      "altus-corp-tasks-2026-05-17.csv",
    );
  });

  it("uses today by default", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(exportFilename("employees")).toBe(`altus-corp-employees-${today}.csv`);
  });
});
