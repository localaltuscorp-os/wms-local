/**
 * HR LETTERS — the declarative letter/agreement model.
 *
 * A letter is authored ONCE as a `LetterTemplate`: a `key`, a `title`, a
 * `category`, a default paying `entity`, and an ordered array of content
 * `blocks`. Blocks are either FIXED prose (headings, paragraphs, bullets, term
 * rows, a signature block) or contain EDITABLE inline fields — the "red text"
 * the HR desk fills in per letter. Everything that is NOT a field is frozen: the
 * body reads the same on every issue.
 *
 * ── Why this shape ─────────────────────────────────────────────────────────
 * Each letter opens on its OWN page (`/hr/letters/<key>`) wrapped in the shared
 * <Letterhead>. The page walks `blocks` and renders:
 *   · fixed spans as plain text
 *   · field spans as inline, floating-label inputs (the editable red text)
 * The SAME `blocks` model drives the on-screen editor, the live preview, the PDF
 * export and the issued/archived document — one source of truth, no drift.
 *
 * This module is PURE + CLIENT-SAFE (no db / node / server-only imports): the
 * client editor, the server PDF renderer and the issue action all import it, so
 * it must never reach for a server dependency. Load-neutral.
 *
 * ── Authoring quick-reference ──────────────────────────────────────────────
 * Use the tiny span/block builders exported below so a template reads like prose:
 *
 *   import { t, f, para, heading, term, bullets, signature } from "./types";
 *
 *   const template: LetterTemplate = {
 *     key: "rejection",
 *     title: "Rejection Letter",
 *     category: "recruitment",
 *     entityDefault: "altus-corp",
 *     signature: "none",
 *     blocks: [
 *       // A paragraph mixing fixed text and inline editable (red) fields:
 *       para(
 *         t("Dear "),
 *         f("candidateName", "Candidate Name", { placeholder: "Full name" }),
 *         t(","),
 *       ),
 *       para(t("Thank you for your time and interest in the "),
 *            f("position", "Position Title"),
 *            t(" role at "),
 *            f("company", "Company Name", { defaultValue: "Altus Corp" }),
 *            t(".")),
 *
 *       // A heading:
 *       heading("Next steps", 2),
 *
 *       // A "Label : <field>" term row (the value can be fixed or a field):
 *       term("Department", f("department", "Department")),
 *
 *       // A bullet list (each bullet is its own span array):
 *       bullets(
 *         [t("Bring a valid photo ID.")],
 *         [t("Report to "), f("place", "Place", { defaultValue: "Mumbai" }), t(".")],
 *       ),
 *
 *       // The signature block — "For <entity>", (E-Sign), name, designation, date, place:
 *       signature({
 *         forEntity: true,
 *         esign: true,
 *         name: [t("CA Manan Vasa")],
 *         designation: [f("signatoryDesignation", "Designation", { defaultValue: "Founder" })],
 *         showDate: true,
 *         place: [t("Mumbai")],
 *       }),
 *     ],
 *   };
 *
 * A field's `id` is unique WITHIN a template and is the key its value is stored
 * under (in `document_instances.merge_values`). Reuse the same `id` in two spans
 * to keep them in sync (e.g. a name used in the greeting and the closing).
 */

import type { EntityId } from "@/lib/hr/entities";

/* ------------------------------------------------------------------ */
/* Categories — the seven letter families (UI grouping + taxonomy)      */
/* ------------------------------------------------------------------ */

export const HR_CATEGORIES = [
  "recruitment",
  "appointment",
  "policies",
  "compensation",
  "milestones",
  "requests",
  "separation",
] as const;
export type HrCategory = (typeof HR_CATEGORIES)[number];

/** Human labels for each category (section headings in the letters index). */
export const CATEGORY_LABELS: Record<HrCategory, string> = {
  recruitment: "Recruitment & Interns",
  appointment: "Appointment & Agreements",
  policies: "Policies",
  compensation: "Compensation",
  milestones: "Milestones & Recognition",
  requests: "Requests",
  separation: "Separation",
};

/** How a letter is signed / acknowledged (drives the e-sign wiring on issue). */
export type LetterSignature = "none" | "acknowledge" | "esign";

/**
 * WHO signs a letter — the authorisation hierarchy:
 *   · "director" — the Director / Boss signature (CA Manan Vasa). RESERVED for
 *     the CTC Breakdown and the full/detailed Appointment Letter.
 *   · "hr"       — the HR desk signature, used for every other operational
 *     letter, onboarding form and notice (adds the HR email + phone footer).
 */
export type LetterSignatory = "director" | "hr";

/* ------------------------------------------------------------------ */
/* Spans — the atoms of a paragraph / value                             */
/* ------------------------------------------------------------------ */

/** A run of FIXED, non-editable prose. */
export interface TextSpan {
  t: "text";
  text: string;
}

/**
 * An inline EDITABLE field — the "red text". Rendered as a floating-label input
 * in the editor and as the filled value in the preview / PDF.
 */
export interface FieldSpan {
  t: "field";
  /** Unique within the template; the merge_values key its value is stored under. */
  id: string;
  /** Floating label shown inside the empty field (animates up on focus/type). */
  label: string;
  /** Ghost hint shown when focused + empty (optional). */
  placeholder?: string;
  /** Seed value the field starts with (still fully editable). */
  defaultValue?: string;
  /** Render a multi-line textarea instead of a single-line input. */
  multiline?: boolean;
  /**
   * Render the field's value in BOLD (editor input, "Edit freely" HTML seed and
   * the PDF). Used for emphasis fields like the letter Subject line.
   */
  bold?: boolean;
  /**
   * Render a native date picker (calendar) in the editor. The stored value is the
   * human-formatted date (e.g. "15 August 2026") — so the preview/PDF read it
   * verbatim like any other field. Used for the Joining Date.
   */
  date?: boolean;
  /**
   * Render a `<select>` fed by a LIVE list resolved in the editor from the page's
   * data (not baked into the template): "departments" (admin Departments master)
   * or "managers" (the active-employee roster). The stored value is the chosen
   * label, so the preview/PDF read it verbatim. Used for Department + Reporting
   * Manager on the Selection letter.
   */
  optionsKey?: "departments" | "managers";
  /**
   * Restrict the input to digits (with ₹ / commas / spaces for currency) — a
   * numeric field. Non-numeric characters are stripped on entry. Used for the
   * salary fields so a letter never carries stray prose in an amount.
   */
  numeric?: boolean;
}

/** A paragraph / value is an ordered list of fixed + editable spans. */
export type Span = TextSpan | FieldSpan;

/* ------------------------------------------------------------------ */
/* Blocks — the ordered content nodes of a letter body                  */
/* ------------------------------------------------------------------ */

/** A section heading. `level` 1 (largest) … 3 (smallest). */
export interface HeadingBlock {
  kind: "heading";
  text: string;
  level?: 1 | 2 | 3;
}

/** A body paragraph — a mix of fixed prose and inline editable fields. */
export interface ParagraphBlock {
  kind: "paragraph";
  spans: Span[];
  /**
   * Paragraph alignment. When omitted the renderers JUSTIFY the prose (the
   * default for generated letters/documents); `center` and `right` are explicit
   * overrides (e.g. a right-aligned Designation in the CTC header).
   */
  align?: "left" | "center" | "right";
}

/** A "Label : value" term row — e.g. `Department : <field>`. */
export interface TermRowBlock {
  kind: "term";
  label: string;
  value: Span[];
}

/** A bullet list — each item is its own span array (fixed + fields). */
export interface BulletsBlock {
  kind: "bullets";
  items: Span[][];
}

/** Vertical whitespace between blocks. */
export interface SpacerBlock {
  kind: "spacer";
  size?: "sm" | "md" | "lg";
}

/* ------------------------------------------------------------------ */
/* Table block — a bordered grid (e.g. the CTC salary break-up)         */
/* ------------------------------------------------------------------ */

/**
 * The visual weight of a table row:
 *  · "normal" — a plain data row.
 *  · "group"  — a section header spanning ALL columns (its first cell is the
 *               heading text; further cells are ignored), e.g. "A. Pay Slip Salary".
 *  · "total"  — a sub-total row (bold, tinted), e.g. "SUB-TOTAL".
 *  · "grand"  — the head-line total (strong brand fill), e.g. "Net Salary".
 */
export type TableRowKind = "normal" | "group" | "total" | "grand";

/**
 * One row of a {@link TableBlock}. `cells` align left→right to the block's
 * `columns`; each cell is a `Span[]`, so it can mix FIXED text (`t()`) with
 * inline EDITABLE fields (`f()`) — e.g. a component name that carries an editable
 * "% of basic" field, or a money cell that is a single editable ₹ field.
 */
export interface TableRow {
  /** Cell contents, aligned to `columns` (a "group" row uses only cell 0). */
  cells: Span[][];
  /** Row weight (styling + semantics). Defaults to "normal". */
  kind?: TableRowKind;
  /**
   * When set, this is a COMPONENT row that is dropped from the FINAL rendered
   * document (PDF export / rich HTML / issued letter) whenever the field with
   * this id resolves to blank / zero — so a produced CTC letter never prints
   * empty ₹0 lines. The interactive field editor still shows it (so it is
   * fillable); a per-table "hide empty" toggle previews the final result.
   */
  amountFieldId?: string;
}

/** A bordered data table — columns + rows of `Span[]` cells (fixed + fields). */
export interface TableBlock {
  kind: "table";
  /** Column headers, left → right. */
  columns: string[];
  /** The body rows. */
  rows: TableRow[];
}

/**
 * The closing signature block:
 *   For <entity>            ← rendered from the selected paying entity when forEntity
 *   (E-Sign)                ← shown when esign
 *   <name>                  ← e.g. "CA Manan Vasa" or a field
 *   <designation>           ← e.g. "Founder"
 *   Date: <letter date>     ← shown when showDate (auto today, editable)
 *   Place: <place>          ← e.g. "Mumbai"
 */
export interface SignatureBlock {
  kind: "signature";
  /** Render the "For <entity>" line from the selected paying entity. */
  forEntity?: boolean;
  /** Show the "(E-Sign)" marker line. */
  esign?: boolean;
  /** Signatory name spans (fixed text and/or a field). */
  name: Span[];
  /** Signatory designation spans (optional). */
  designation?: Span[];
  /**
   * A BAKED signature image (a `public/…` path, e.g. the founder's scanned
   * signature) rendered under "For <entity>". When set, this block prints its own
   * `name` + `designation` (NOT the generic HR-desk sign-off) — used so the
   * Selection letter is signed off by the founder rather than "HR Team". An
   * uploaded scanned signature still overrides it.
   */
  imageSrc?: string;
  /** Show a "Date:" line (defaults to today; editable via the `date` field). */
  showDate?: boolean;
  /** Place-of-issue spans (optional), e.g. "Mumbai". */
  place?: Span[];
}

/** Any content node in a letter body. */
export type Block =
  | HeadingBlock
  | ParagraphBlock
  | TermRowBlock
  | BulletsBlock
  | SpacerBlock
  | TableBlock
  | SignatureBlock;

/* ------------------------------------------------------------------ */
/* The template                                                         */
/* ------------------------------------------------------------------ */

export interface LetterTemplate {
  /** Stable identity + URL segment (`/hr/letters/<key>`). Unique across letters. */
  key: string;
  /** Title shown on the page, the index card and the archived document. */
  title: string;
  /** Which family it belongs to (index grouping + taxonomy). */
  category: HrCategory;
  /** The paying entity the letterhead defaults to (user can swap it). */
  entityDefault?: EntityId;
  /** Signing model — drives the e-sign wiring when the letter is issued. */
  signature?: LetterSignature;
  /**
   * Who signs it — the Director/Boss or the HR desk. When omitted it is derived
   * by {@link signatoryOf} (director for the CTC + Appointment letters, HR for
   * everything else).
   */
  signatory?: LetterSignatory;
  /** One-line description for the index card. */
  blurb?: string;
  /** The ordered body content. */
  blocks: Block[];
}

/* ------------------------------------------------------------------ */
/* Authoring builders — terse helpers so templates read like prose      */
/* ------------------------------------------------------------------ */

/** Fixed prose span. */
export const t = (text: string): TextSpan => ({ t: "text", text });

/** Editable inline field span (the red text). */
export const f = (
  id: string,
  label: string,
  opts?: {
    placeholder?: string;
    defaultValue?: string;
    multiline?: boolean;
    bold?: boolean;
    date?: boolean;
    optionsKey?: "departments" | "managers";
    numeric?: boolean;
  },
): FieldSpan => ({ t: "field", id, label, ...opts });

/** A paragraph from a list of spans. */
export const para = (...spans: Span[]): ParagraphBlock => ({ kind: "paragraph", spans });

/** A centred paragraph (certificates / citations). */
export const paraCenter = (...spans: Span[]): ParagraphBlock => ({
  kind: "paragraph",
  spans,
  align: "center",
});

/** A right-aligned paragraph (e.g. a Designation at the top-right of a header). */
export const paraRight = (...spans: Span[]): ParagraphBlock => ({
  kind: "paragraph",
  spans,
  align: "right",
});

/** A heading block. */
export const heading = (text: string, level: 1 | 2 | 3 = 2): HeadingBlock => ({
  kind: "heading",
  text,
  level,
});

/** A "Label : value" term row. `value` may be a single span or an array. */
export const term = (label: string, value: Span | Span[]): TermRowBlock => ({
  kind: "term",
  label,
  value: Array.isArray(value) ? value : [value],
});

/** A bullet list from item span-arrays. */
export const bullets = (...items: Span[][]): BulletsBlock => ({ kind: "bullets", items });

/** Vertical space. */
export const spacer = (size: "sm" | "md" | "lg" = "md"): SpacerBlock => ({ kind: "spacer", size });

/** A bordered table from column headers + rows. */
export const table = (columns: string[], rows: TableRow[]): TableBlock => ({
  kind: "table",
  columns,
  rows,
});

/** A plain data row (cells align to the table's columns). */
export const trow = (
  cells: Span[][],
  opts?: { kind?: TableRowKind; amountFieldId?: string },
): TableRow => ({ cells, kind: opts?.kind ?? "normal", amountFieldId: opts?.amountFieldId });

/** A full-width section header row, e.g. "A. Pay Slip Salary". */
export const tgroup = (label: string): TableRow => ({ cells: [[t(label)]], kind: "group" });

/** A sub-total row (bold, tinted). `cells` align to the columns. */
export const ttotal = (cells: Span[][]): TableRow => ({ cells, kind: "total" });

/** The head-line total row (strong brand fill). `cells` align to the columns. */
export const tgrand = (cells: Span[][]): TableRow => ({ cells, kind: "grand" });

/**
 * A CTC-style component row: a name cell (with an optional inline "% of basic"
 * field), an editable per-month ₹ cell and an editable per-annum ₹ cell. The row
 * is hidden from the FINAL document when its per-month field is blank/zero.
 */
export const tcomponent = (name: Span[], perMonth: Span[], perAnnum: Span[], amountFieldId: string): TableRow => ({
  cells: [name, perMonth, perAnnum],
  kind: "normal",
  amountFieldId,
});

/** The closing signature block. */
export const signature = (block: Omit<SignatureBlock, "kind">): SignatureBlock => ({
  kind: "signature",
  ...block,
});

/* ------------------------------------------------------------------ */
/* Introspection — walk a template's fields                             */
/* ------------------------------------------------------------------ */

/** The de-duplicated spec of one editable field in a template. */
export interface FieldSpec {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  bold?: boolean;
}

function spansOf(block: Block): Span[] {
  switch (block.kind) {
    case "paragraph":
      return block.spans;
    case "term":
      return block.value;
    case "bullets":
      return block.items.flat();
    case "table":
      return block.rows.flatMap((r) => r.cells.flat());
    case "signature":
      return [...block.name, ...(block.designation ?? []), ...(block.place ?? [])];
    default:
      return [];
  }
}

/**
 * Every editable field in a template, in first-appearance order, de-duplicated
 * by `id` (a field reused across spans is listed once). Used to build the editor
 * inputs and the initial value map.
 */
export function collectFields(template: LetterTemplate): FieldSpec[] {
  const seen = new Set<string>();
  const out: FieldSpec[] = [];
  for (const block of template.blocks) {
    for (const span of spansOf(block)) {
      if (span.t !== "field" || seen.has(span.id)) continue;
      seen.add(span.id);
      out.push({
        id: span.id,
        label: span.label,
        placeholder: span.placeholder,
        defaultValue: span.defaultValue,
        multiline: span.multiline,
        bold: span.bold,
      });
    }
  }
  return out;
}

/** A field-id → seed-value map from every field's `defaultValue` (blank if none). */
export function initialValues(template: LetterTemplate): Record<string, string> {
  const values: Record<string, string> = {};
  for (const spec of collectFields(template)) values[spec.id] = spec.defaultValue ?? "";
  return values;
}

/** Resolve a span array to plain text given the filled field values. */
export function resolveSpans(spans: Span[], values: Record<string, string>): string {
  return spans
    .map((s) => (s.t === "text" ? s.text : (values[s.id] ?? "").trim()))
    .join("");
}

/**
 * A money field counts as "empty" for hide-empty-row purposes when it is blank,
 * or every digit in it is zero (so "", "0", "₹0", "0.00", "-" all hide the row).
 */
export function isBlankAmount(raw: string | undefined | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return true;
  const digits = s.replace(/[^0-9]/g, "");
  return digits.length === 0 || /^0+$/.test(digits);
}

/**
 * Should a table row be shown in the FINAL rendered document? A component row
 * (one carrying `amountFieldId`) is dropped when that field is blank/zero;
 * every other row is always kept.
 */
export function tableRowVisible(row: TableRow, values: Record<string, string>): boolean {
  if (!row.amountFieldId) return true;
  return !isBlankAmount(values[row.amountFieldId]);
}

/**
 * Resolve which signature block a letter carries. Uses the template's explicit
 * `signatory` when set; otherwise the Director signs the CTC Breakdown and the
 * full Appointment Letter, and the HR desk signs every other operational letter.
 */
export function signatoryOf(template: LetterTemplate): LetterSignatory {
  if (template.signatory) return template.signatory;
  if (template.key === "ctc-breakup" || template.key === "appointment") return "director";
  return "hr";
}

/**
 * True when the template prints its OWN date inside the body (an editable
 * `date` field, e.g. the Intern Appointment Letter's `Date: [ … ]` row).
 *
 * The letter chrome stamps a formatted date at the top-right of every letter;
 * for these templates that duplicated the body's date on screen and in the PDF,
 * so both the editor and the PDF renderer suppress the top-right stamp here and
 * let the editable field be the single source of the letter's date.
 */
export function hasBodyDateField(template: LetterTemplate): boolean {
  return collectFields(template).some((spec) => spec.id === "date");
}
