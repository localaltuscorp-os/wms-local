/**
 * HR LETTERS — structured → rich HTML converter (the "Edit freely" seed).
 *
 * A letter opens by DEFAULT in the structured fill editor (blocks + inline
 * fields). When the user clicks "Edit freely" we EJECT into a full Google-Docs
 * style TipTap editor. `templateToRichHtml` produces the seed the editor loads:
 * it flattens a `LetterTemplate`'s blocks + spans — with the current field
 * VALUES already merged in — into clean, semantic HTML that TipTap's StarterKit
 * (+ text-align / lists / etc.) round-trips losslessly.
 *
 *   heading   → <h1|h2|h3>            (by level, default h2)
 *   paragraph → <p> (align-aware)
 *   term      → grouped into <table class="alw-termtable"> (Label | value rows)
 *   bullets   → <ul><li>…</li></ul>
 *   signature → "For <entity>" / (E-Sign) / name / designation / Date / Place
 *   spacer    → empty <p></p>
 *
 * A FILLED field renders as its plain value inline. An EMPTY field renders as a
 * visible-but-fillable marker — <span class="letter-field-empty"
 * data-field-id="…">Label</span> — so the HR user can see (and click to fill)
 * the gaps even after ejecting to free editing.
 *
 * PURE + CLIENT-SAFE — no db / node / @tiptap import. It is imported by the
 * client editor (to seed TipTap) AND by the server (headless-Chromium) PDF
 * renderer, so it MUST stay dependency-free and load-neutral. It reads the
 * paying-entity display name from the pure `@/lib/hr/entities` registry only.
 */

import { formatDate } from "@/lib/format";
import { getEntity, type Entity, type EntityId } from "@/lib/hr/entities";
import { applyPronouns, type Gender } from "@/lib/hr/pronouns";
import { applyFirm, HR_CONTACT, HR_SIGNATORY, HR_SIGNATURE_IMAGE } from "@/lib/hr/firm";
import {
  type LetterTemplate,
  type Block,
  type LetterSignatory,
  type Span,
  signatoryOf,
  tableRowVisible,
} from "./types";

/* ------------------------------------------------------------------ */
/* Public types                                                         */
/* ------------------------------------------------------------------ */

/**
 * Which editor a letter instance is being composed in:
 *  · 'structured' — the default block/field fill editor (source = the template)
 *  · 'rich'       — the ejected Google-Docs TipTap editor (source = free HTML)
 */
export type ContentKind = "structured" | "rich";

/** The persisted body of a rich ("Edit freely") letter — the TipTap HTML. */
export interface RichLetterDoc {
  html: string;
}

/* ------------------------------------------------------------------ */
/* HTML escaping                                                        */
/* ------------------------------------------------------------------ */

/** Escape a string for safe inclusion in HTML text / attribute context. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ */
/* Span → HTML                                                          */
/* ------------------------------------------------------------------ */

/**
 * Render one span array to inline HTML. A filled field becomes its escaped
 * value; an empty field becomes a visible, clickable placeholder marker that
 * carries the field id so downstream tooling can still locate it after eject.
 */
function spansToHtml(spans: Span[], values: Record<string, string>): string {
  let out = "";
  for (const span of spans) {
    if (span.t === "text") {
      out += esc(span.text);
      continue;
    }
    const value = (values[span.id] ?? "").trim();
    if (value) {
      out += span.bold ? `<strong>${esc(value)}</strong>` : esc(value);
    } else {
      // EMPTY field → a visible, self-labelling "[Field]" placeholder chip so the
      // gap never silently vanishes when the user ejects to free editing. The
      // brackets survive as plain text on every surface; the `letter-field-empty`
      // class (preserved through TipTap by the FieldPlaceholder mark, and styled
      // on the read-only preview + PDF surfaces) paints the red-underlined chip.
      const raw = span.placeholder?.trim() || span.label;
      const label = /^\[.*\]$/.test(raw) ? raw : `[${raw}]`;
      const marker = `<span class="letter-field-empty" data-field-id="${esc(span.id)}">${esc(label)}</span>`;
      out += span.bold ? `<strong>${marker}</strong>` : marker;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Block → HTML                                                         */
/* ------------------------------------------------------------------ */

function headingTag(level: 1 | 2 | 3 | undefined): "h1" | "h2" | "h3" {
  return level === 1 ? "h1" : level === 3 ? "h3" : "h2";
}

function blockToHtml(
  block: Block,
  values: Record<string, string>,
  entity: Entity,
  signatory: LetterSignatory,
): string {
  switch (block.kind) {
    case "heading": {
      const tag = headingTag(block.level);
      return `<${tag}>${esc(block.text)}</${tag}>`;
    }
    case "paragraph": {
      const inner = spansToHtml(block.spans, values);
      const align =
        block.align === "center" ? "center" : block.align === "right" ? "right" : "justify";
      return `<p style="text-align:${align}">${inner || "<br>"}</p>`;
    }
    case "term": {
      const value = spansToHtml(block.value, values);
      return `<p><strong>${esc(block.label)}</strong> : ${value}</p>`;
    }
    case "bullets": {
      const items = block.items
        .map((item) => `<li>${spansToHtml(item, values) || "<br>"}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    case "spacer": {
      return "<p><br></p>";
    }
    case "table": {
      const cols = block.columns.length;
      const th = block.columns
        .map(
          (c, i) =>
            `<th style="padding:7px 11px;border:1px solid #cbd5e1;background:#f2f3f6;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;text-align:${i === 0 ? "left" : "right"}">${esc(c)}</th>`,
        )
        .join("");
      const trs = block.rows
        .filter((row) => tableRowVisible(row, values))
        .map((row) => {
          const kind = row.kind ?? "normal";
          if (kind === "group") {
            return `<tr><td colspan="${cols}" style="padding:8px 11px;border:1px solid #cbd5e1;background:#f4f5f7;font-weight:900;font-size:12px;letter-spacing:.02em;text-transform:uppercase;color:#A80400">${spansToHtml(row.cells[0] ?? [], values)}</td></tr>`;
          }
          const grand = kind === "grand";
          const total = kind === "total";
          const rowBg = grand ? "#A80400" : total ? "#fcebea" : "#ffffff";
          const cells = Array.from({ length: cols })
            .map((_, i) => {
              const align = i === 0 ? "left" : "right";
              const color = grand ? "#ffffff" : i === 0 ? "#0f172a" : "#334155";
              const weight = grand || total || i > 0 ? 800 : 600;
              return `<td style="padding:7px 11px;border:1px solid #cbd5e1;text-align:${align};color:${color};font-weight:${weight}">${spansToHtml(row.cells[i] ?? [], values) || "&nbsp;"}</td>`;
            })
            .join("");
          return `<tr style="background:${rowBg}">${cells}</tr>`;
        })
        .join("");
      return `<table style="width:100%;border-collapse:collapse;margin:10px 0;font-variant-numeric:tabular-nums"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    }
    case "signature": {
      const isHr = signatory === "hr";
      // A block carrying its OWN baked signature (the Selection letter's founder
      // sign-off) prints its own name + designation + image, not the HR block.
      const baked = block.imageSrc;
      const ownSignatory = Boolean(baked) || !isHr;
      const lines: string[] = [];
      if (block.forEntity) lines.push(`<p><strong>For ${esc(entity.displayName)}</strong></p>`);
      // The signature MARK, matching the PDF renderer's precedence: a per-block
      // baked image first, then the HR desk's standing signature on HR letters.
      // "(E-Sign)" used to stand in for a signature that was never actually
      // applied — the letter went out with a typed placeholder where a mark
      // belonged. Now the mark is real, and the placeholder is only a fallback
      // for non-HR blocks that have no image of their own.
      const mark = baked ?? (isHr ? HR_SIGNATURE_IMAGE : null);
      if (mark) lines.push(`<p><img src="${esc(mark)}" alt="Signature" style="height:46px" /></p>`);
      else if (block.esign) lines.push(`<p>(E-Sign)</p>`);
      else lines.push("<p><br></p>");
      const name = ownSignatory ? spansToHtml(block.name, values) : esc(HR_SIGNATORY.name);
      if (name) lines.push(`<p><strong>${name}</strong></p>`);
      const desig = baked
        ? block.designation
          ? spansToHtml(block.designation, values)
          : ""
        : isHr
          ? esc(HR_SIGNATORY.designation)
          : block.designation
            ? spansToHtml(block.designation, values)
            : "";
      if (desig) lines.push(`<p>${desig}</p>`);
      if (block.showDate) lines.push(`<p>Date : ${esc(currentDate())}</p>`);
      if (block.place) {
        const p = spansToHtml(block.place, values);
        if (p) lines.push(`<p>Place : ${p}</p>`);
      }
      // HR-signed letters carry the HR desk contact directly under the sign-off.
      if (isHr && !baked) {
        const phone = HR_CONTACT.phone.trim();
        lines.push(
          `<p>HR: ${esc(HR_CONTACT.email)}${phone ? ` · HR Manager: ${esc(phone)}` : ""}</p>`,
        );
      }
      return lines.join("");
    }
  }
}

/** Today's date in the canonical Altus letter format (e.g. "25 Jul 2026"). */
function currentDate(): string {
  return formatDate(new Date());
}

/* ------------------------------------------------------------------ */
/* Public entry                                                         */
/* ------------------------------------------------------------------ */

/**
 * Flatten a structured letter template (with its filled field values) into the
 * clean semantic HTML the TipTap "Edit freely" editor loads as its seed. The
 * paying `entity` (id / Entity / display string) drives the signature's
 * "For <entity>" line; when omitted it falls back to the template default.
 */
export function templateToRichHtml(
  template: LetterTemplate,
  values: Record<string, string>,
  entity?: EntityId | Entity | string | null,
  gender: Gender = "neutral",
): string {
  const resolved = getEntity(entity ?? template.entityDefault ?? null);
  const signatory = signatoryOf(template);
  const vals = values ?? {};
  const blocks = template.blocks;

  // Group CONSECUTIVE `term` blocks into ONE bordered 2-column table
  // (Label | value) — identical structure/classes to the structured field
  // view's <TermTable> so the professional table survives an "Edit freely"
  // eject AND its save. (Previously each term became a colon <p>, so entering
  // free-edit silently flattened the table into "Label : value" text lines.)
  const parts: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === "term") {
      const rows: string[] = [];
      let j = i;
      while (j < blocks.length) {
        const tb = blocks[j]!;
        if (tb.kind !== "term") break;
        rows.push(
          `<tr><th class="alw-tt-label">${esc(tb.label)}</th><td class="alw-tt-val">${spansToHtml(tb.value, vals) || "&nbsp;"}</td></tr>`,
        );
        j += 1;
      }
      parts.push(`<table class="alw-termtable"><tbody>${rows.join("")}</tbody></table>`);
      i = j;
    } else {
      parts.push(blockToHtml(b, vals, resolved, signatory));
      i += 1;
    }
  }
  const html = parts.join("\n");
  // Resolve gendered tokens ({title}/{he}/{his}/… → Mr./Ms., his/her, …) AND the
  // firm-name token ({firm} → the issuing entity) so the "Edit freely" seed
  // already reads correctly for this candidate + paying entity.
  return applyFirm(applyPronouns(html, gender), resolved);
}
