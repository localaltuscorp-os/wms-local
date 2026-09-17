/**
 * A minimal ZIP writer — STORE only, no compression, no dependencies.
 *
 * Why not a library: the files going in are PDFs and phone photos, which are
 * already compressed, so deflate would spend CPU for a few percent. What is
 * left is ~100 lines of well-specified headers (PKWARE APPNOTE 6.3.x), which is
 * less risk than a new dependency in the serverless bundle.
 *
 * Names are written as UTF-8 with general-purpose bit 11 set, so "Aadhaar –
 * स्कैन.pdf" opens correctly in Windows Explorer, macOS and 7-Zip. No ZIP64:
 * one person's record is megabytes, and the 4 GB / 65,535-entry limits throw a
 * clear error rather than writing a corrupt archive.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipInput {
  /** Forward-slash path inside the archive, e.g. "Asha (asha@x)/Forms/Onboarding Form.pdf". */
  path: string;
  data: Uint8Array;
  modified?: Date;
}

const UTF8_FLAG = 0x0800;
const VERSION = 20;
const LIMIT = 0xffffffff;

/** MS-DOS date/time, local fields. ZIP cannot represent years before 1980. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function buildZip(files: ZipInput[]): Uint8Array {
  if (files.length > 0xffff) throw new Error("Too many files for one ZIP (limit 65,535).");
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const path = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path || path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
      throw new Error(`Invalid path in ZIP: "${file.path}"`);
    }
    const dedupeKey = path.toLowerCase();
    if (seen.has(dedupeKey)) throw new Error(`Duplicate path in ZIP: "${path}"`);
    seen.add(dedupeKey);

    const name = encoder.encode(path);
    const size = file.data.length;
    if (size >= LIMIT || offset >= LIMIT) throw new Error("ZIP would exceed 4 GB.");
    const crc = crc32(file.data);
    const { time, date } = dosDateTime(file.modified ?? new Date());

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, VERSION, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, VERSION, true);
    cv.setUint16(6, VERSION, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // extra length, comment length, disk number, internal attrs: all 0
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true);
    entry.set(name, 46);

    parts.push(local, file.data);
    central.push(entry);
    offset += local.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  if (offset + centralSize >= LIMIT) throw new Error("ZIP would exceed 4 GB.");
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
