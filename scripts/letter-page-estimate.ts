/**
 * Estimate how many printed A4 pages each HR letter occupies.
 *
 * Walks every registered LetterTemplate's blocks and adds up the height they
 * occupy in the letter body, using the SAME metrics the on-screen editor uses
 * (letter-editor.tsx CSS), then divides by the 827px of content one printed A4
 * page holds (1123 page - 196 header spacer - 100 footer spacer, the same
 * PAGE_CONTENT_H the rich editor measures against).
 *
 * This is an ESTIMATE, not a render: line counts come from an average character
 * width for 15px Georgia, and an unfilled field is measured at its placeholder /
 * label width. Real letters move with what HR actually types. It is meant for
 * picking which letters to eyeball, not for laying anything out.
 *
 * Run: npx tsx scripts/letter-page-estimate.ts
 */

import { LETTER_LIST } from "../lib/hr/letters/registry";
import type { Block, Span } from "../lib/hr/letters/types";

/** Content height of ONE printed A4 page (see rich-letter-editor.tsx). */
const PAGE_CONTENT_H = 1123 - 196 - 100; // 827

/** Body text column: 794px sheet less the 70px padding either side. */
const BODY_W = 794 - 70 * 2; // 654

/** Average glyph width at 15px Georgia — the body face. */
const CHAR_W = 7.15;

/** Lines a run of text wraps to in a column `width` px wide at `charW` px/char. */
function lines(text: string, width = BODY_W, charW = CHAR_W): number {
  const perLine = Math.max(1, Math.floor(width / charW));
  return Math.max(1, Math.ceil(text.length / perLine));
}

/**
 * Flatten a span array to the text that will actually occupy space. A field
 * with no value renders as an input sized to its placeholder (or its label, if
 * it has no placeholder) — that is the width it takes on a blank letter.
 */
function spanText(spans: Span[]): string {
  return spans
    .map((s) =>
      // The discriminant is `t`, NOT `kind` (blocks use `kind`, spans use `t`).
      // Testing the wrong one made every TextSpan fall through to the field
      // branch and measure as an empty string, so every letter's fixed prose —
      // most of its text — counted as zero height.
      s.t === "text" ? s.text : (s.defaultValue ?? s.placeholder ?? s.label),
    )
    .join("");
}

/** Estimated height in px of one block, matching letter-editor.tsx's CSS. */
function blockHeight(b: Block): number {
  switch (b.kind) {
    case "spacer":
      return b.size === "lg" ? 22 : b.size === "sm" ? 6 : 12;

    case "heading": {
      // .alw-heading: margin 16px top / 8px bottom, font 20/16/14 at ~1.3 lh.
      const fs = b.level === 1 ? 20 : b.level === 3 ? 14 : 16;
      return 16 + Math.ceil(fs * 1.3) + 8;
    }

    case "paragraph": {
      // .alw-p: 15px / 1.95 line-height, 14px bottom margin.
      const text = spanText(b.spans);
      if (!text.trim()) return 8;
      return lines(text) * Math.ceil(15 * 1.95) + 14;
    }

    case "term": {
      // A run of terms renders as .alw-termtable rows: 7px padding either side
      // of a 15px/1.5 line, in the 62%-wide value column.
      const value = spanText(b.value);
      const valW = BODY_W * 0.62 - 24;
      const labW = BODY_W * 0.38 - 24;
      const rows = Math.max(lines(value, valW), lines(b.label, labW));
      return rows * Math.ceil(15 * 1.5) + 14;
    }

    case "bullets": {
      // .alw-ul: 14px bottom margin; each li is 15px/1.9 with a 7px gap, inside
      // a 20px marker indent.
      let h = 14;
      for (const item of b.items) {
        h += lines(spanText(item), BODY_W - 24) * Math.ceil(15 * 1.9) + 7;
      }
      return h;
    }

    case "table": {
      // .alw-tablewrap margins + a 38px header row + ~31px per body row.
      return 6 + 16 + 38 + b.rows.length * 31;
    }

    case "signature": {
      // .alw-sign: 26px top margin, then "For <entity>", the signing space or
      // mark, name, designation, and the Date / Place metas.
      let h = 26;
      if (b.forEntity) h += 26;
      h += 66 + 8; // signature mark (or the 44px blank strip + its margins)
      h += 26; // name
      h += 24; // designation
      if (b.showDate) h += 23;
      if (b.place) h += 23;
      return h;
    }
  }
}

/** The letter date stamped at the top of the body on most templates. */
const DATE_STAMP_H = 22;

type Row = {
  key: string;
  title: string;
  category: string;
  height: number;
  pages: number;
  /** How far into the last page the content reaches, 0..1. */
  fill: number;
};

const rows: Row[] = LETTER_LIST.map((tpl) => {
  const height =
    DATE_STAMP_H + tpl.blocks.reduce((sum, b) => sum + blockHeight(b), 0);
  const pages = Math.max(1, Math.ceil(height / PAGE_CONTENT_H));
  const fill = (height - (pages - 1) * PAGE_CONTENT_H) / PAGE_CONTENT_H;
  return {
    key: tpl.key,
    title: tpl.title,
    category: tpl.category,
    height: Math.round(height),
    pages,
    fill,
  };
}).sort((a, b) => b.height - a.height);

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

console.log(
  `\nOne printed page holds ${PAGE_CONTENT_H}px of body. ${rows.length} registered letters.\n`,
);
console.log(
  `${pad("KEY", 30)}${pad("PAGES", 7)}${pad("HEIGHT", 9)}${pad("LAST PAGE", 11)}TITLE`,
);
console.log("-".repeat(100));
for (const r of rows) {
  const fillPct = `${Math.round(r.fill * 100)}%`;
  console.log(
    `${pad(r.key, 30)}${pad(String(r.pages), 7)}${pad(`${r.height}px`, 9)}${pad(fillPct, 11)}${r.title}`,
  );
}

/* ---- The interesting cases -------------------------------------------- */
const multi = rows.filter((r) => r.pages >= 2);
// A letter whose last page is barely used is the one that wastes a whole sheet
// on a few lines; a letter sitting just under a boundary tips over as soon as
// HR types a long value into a field.
const thin = rows.filter((r) => r.pages >= 2 && r.fill <= 0.25);
const borderline = rows.filter((r) => r.fill >= 0.8 && r.fill < 1);

console.log(`\n${multi.length} letters run to 2+ pages:`);
for (const r of multi) console.log(`  · ${r.key} — ${r.pages} pages`);

console.log(`\nSpills onto a barely-used last page (the wasted sheet):`);
for (const r of thin)
  console.log(`  · ${r.key} — page ${r.pages} only ${Math.round(r.fill * 100)}% used`);

console.log(`\nSitting just under a page boundary (tips over once HR types):`);
for (const r of borderline)
  console.log(`  · ${r.key} — ${Math.round(r.fill * 100)}% of page ${r.pages}`);
console.log("");
