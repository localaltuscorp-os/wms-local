import { describe, it, expect } from "vitest";
import { crc32 as zlibCrc32 } from "node:zlib";
import { buildZip, crc32 } from "@/lib/hr/records-export/zip";

/** Read a STORE-only zip back through its central directory, the way unzip tools do. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: { path: string; data: Uint8Array; flags: number; crc: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const flags = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const path = decoder.decode(zip.subarray(at + 46, at + 46 + nameLen));
    expect(view.getUint32(localAt, true)).toBe(0x04034b50);
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    out.push({ path, data: zip.subarray(dataAt, dataAt + size), flags, crc });
    at += 46 + nameLen;
  }
  return out;
}

describe("buildZip", () => {
  it("computes the same CRC-32 as zlib", () => {
    const bytes = new TextEncoder().encode("HR Records — the quick brown fox");
    expect(crc32(bytes)).toBe(zlibCrc32(bytes));
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("round-trips nested folders and non-ASCII names", () => {
    const a = new TextEncoder().encode("%PDF-1.4 fake");
    const b = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    const zip = buildZip([
      { path: "Asha Kulkarni (asha@x)/Forms/Onboarding Form.pdf", data: a },
      { path: "Asha Kulkarni (asha@x)/Documents/Aadhaar – स्कैन.png", data: b },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.path)).toEqual([
      "Asha Kulkarni (asha@x)/Forms/Onboarding Form.pdf",
      "Asha Kulkarni (asha@x)/Documents/Aadhaar – स्कैन.png",
    ]);
    expect(Array.from(entries[0]!.data)).toEqual(Array.from(a));
    expect(Array.from(entries[1]!.data)).toEqual(Array.from(b));
    for (const e of entries) {
      expect(e.flags & 0x0800).toBe(0x0800); // UTF-8 names
      expect(e.crc).toBe(zlibCrc32(e.data));
    }
  });

  it("writes a valid empty archive", () => {
    const zip = buildZip([]);
    expect(zip.length).toBe(22);
    expect(readZip(zip)).toEqual([]);
  });

  it("refuses duplicate (case-insensitive) and escaping paths", () => {
    const d = new Uint8Array([1]);
    expect(() => buildZip([{ path: "a/x.pdf", data: d }, { path: "A/X.pdf", data: d }])).toThrow(/Duplicate/);
    expect(() => buildZip([{ path: "../x.pdf", data: d }])).toThrow(/Invalid path/);
    expect(() => buildZip([{ path: "a//x.pdf", data: d }])).toThrow(/Invalid path/);
  });
});
