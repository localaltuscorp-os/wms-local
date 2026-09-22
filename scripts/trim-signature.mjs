#!/usr/bin/env node
/**
 * trim-signature.mjs — CROP THE EMPTY MARGIN OFF A SCANNED SIGNATURE.
 *
 * WHY. The letter sign-off renders the mark in a FIXED BOX — 66px tall on
 * screen (`.alw-sign-img` in letter-editor.tsx), 52pt in the PDF — with
 * `object-fit: contain`. So what you see is the whole CANVAS scaled to fit, not
 * the ink. A scan whose signature sits in the middle of a big transparent
 * square therefore renders tiny: the padding is what fills the box.
 *
 * Measured on 2026-09-17, before this script existed:
 *
 *   manan-vasa-sign.png   497x502 canvas, ink 369x151  ->  ink 30% of height
 *                         => about 20px of visible ink in a 66px box
 *   hr-signature.png      422x332 canvas, ink 387x220  ->  ink 66% of height
 *
 * Cropping to the ink (plus a hair of breathing room) makes the mark fill the
 * box the way the original wide scans did, WITHOUT touching the CSS — so
 * uploaded per-issue signatures, which are not trimmed, still behave.
 *
 * USAGE
 *   node scripts/trim-signature.mjs public/signatures/manan-vasa-sign.png
 *   node scripts/trim-signature.mjs <in.png> --out <out.png>   (default: in place)
 *   node scripts/trim-signature.mjs <in.png> --dry             (measure only)
 *
 * SCOPE: 8-bit RGBA, non-interlaced PNG — what a "save with transparency"
 * export produces, and what both current signatures are. Anything else is
 * refused rather than silently mangled. A copy of the original is written
 * alongside as `<name>.orig.png` the first time a file is trimmed in place.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
const out = outIdx !== -1 ? args[outIdx + 1] : file;
const dry = args.includes("--dry");
/** Kept margin, as a fraction of the ink's own size. A signature pressed hard
 *  against the edge of its box looks cramped next to the printed name. */
const PAD = 0.04;

if (!file) {
  console.error("usage: node scripts/trim-signature.mjs <file.png> [--out <file.png>] [--dry]");
  process.exit(2);
}

/* ---------------- decode ---------------- */

function decode(buf) {
  let i = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    i += 12 + len;
  }
  if (depth !== 8 || ctype !== 6 || interlace !== 0) {
    throw new Error(`only 8-bit RGBA non-interlaced PNG is supported (got depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const row = raw.subarray(p, p + stride); p += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const v = row[x];
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = (v + add) & 255;
    }
  }
  return { w, h, px, stride };
}

/* ---------------- encode ---------------- */

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function encode(w, h, px) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none. Signatures are small; simple wins.
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- run ---------------- */

const { w, h, px, stride } = decode(readFileSync(file));

// "Ink" = not transparent AND not near-white. A scan exported on white with an
// alpha channel is common, and treating white as ink would crop nothing.
let x0 = w, y0 = h, x1 = -1, y1 = -1;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const o = y * stride + x * 4;
    if (px[o + 3] > 24 && !(px[o] > 235 && px[o + 1] > 235 && px[o + 2] > 235)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}
if (x1 < 0) {
  console.error(`${file}: no ink found — nothing to trim.`);
  process.exit(1);
}

const padX = Math.round((x1 - x0 + 1) * PAD);
const padY = Math.round((y1 - y0 + 1) * PAD);
const cx0 = Math.max(0, x0 - padX), cy0 = Math.max(0, y0 - padY);
const cx1 = Math.min(w - 1, x1 + padX), cy1 = Math.min(h - 1, y1 + padY);
const nw = cx1 - cx0 + 1, nh = cy1 - cy0 + 1;

console.log(`${file}`);
console.log(`  canvas ${w}x${h}  ->  ${nw}x${nh}   (ink ${x1 - x0 + 1}x${y1 - y0 + 1} at ${x0},${y0})`);
console.log(`  ink filled ${((y1 - y0 + 1) / h * 100).toFixed(0)}% of the height, now ${((y1 - y0 + 1) / nh * 100).toFixed(0)}%`);

if (dry) { console.log("  --dry: nothing written."); process.exit(0); }

const cropped = Buffer.alloc(nh * nw * 4);
for (let y = 0; y < nh; y++) {
  px.copy(cropped, y * nw * 4, (cy0 + y) * stride + cx0 * 4, (cy0 + y) * stride + (cx1 + 1) * 4);
}

if (out === file) {
  const backup = file.replace(/\.png$/i, ".orig.png");
  if (!existsSync(backup)) { copyFileSync(file, backup); console.log(`  original kept at ${backup}`); }
}
writeFileSync(out, encode(nw, nh, cropped));
console.log(`  written ${out}`);
