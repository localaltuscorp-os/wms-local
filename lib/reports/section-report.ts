/**
 * THE SECTION REPORT PAYLOAD — what a dashboard card hands over to be turned
 * into a PDF.
 *
 * Client-safe: no `server-only`, no DB import. The two API routes and every
 * dashboard section import it, so there is one definition of the shape.
 *
 * ── WHY THE CLIENT SENDS ITS ROWS ────────────────────────────────────────
 * The obvious alternative is to pass a section id and re-run the query on the
 * server. That would be wrong here, and not by a little: what the reader wants
 * captured is the view IN FRONT OF THEM — the search they typed, the window
 * they picked, the sort they applied, the rows they expanded. A server-side
 * re-query knows none of that, so the PDF would quietly disagree with the
 * screen it was exported from, which is the one thing a snapshot must not do.
 *
 * So the section serialises what it is currently rendering and the server only
 * lays it out. The trade — a few KB of JSON on the wire — buys the guarantee
 * that the export and the screen can never differ.
 *
 * ── WHY NOT A DOM SCREENSHOT ─────────────────────────────────────────────
 * html2canvas over the section element was the other candidate. It loses on
 * three counts that all bite this dashboard specifically: it rasterises, so the
 * PDF has no selectable text and no real pagination; it clips `overflow: auto`
 * containers to their visible box, and every one of these sections is a 600px
 * scroll box around a table, so the rows past the fold — the ones "expand all"
 * just revealed — would be cut off; and it cannot evaluate `color-mix()` or
 * `oklch()`, which this codebase uses for nearly every colour, so the palette
 * would come out wrong or black. A tabular payload has none of those failure
 * modes and renders through pdfkit, which the payslip and weekly-goals reports
 * already use.
 */

export type ReportAlign = "left" | "right" | "center";

export interface ReportColumn {
  label: string;
  /** Relative width. Columns are laid out in proportion to these. */
  weight?: number;
  align?: ReportAlign;
  /**
   * `count` renders the cell bold crimson when it is carrying something and
   * quiet at zero — the same emphasis the web view gives an overdue tally, so
   * the printed copy and the screen agree about what matters.
   *
   * A hint, not a colour: the renderer owns the palette, so a section cannot
   * introduce a fifth red by describing one.
   */
  tone?: "count";
}

/** One line of the PDF header's filter block — "Date Range: Last 7 Days". */
export interface ReportMeta {
  label: string;
  value: string;
}

export interface SectionReport {
  /** Used for the filename and the WhatsApp message — "Delegation Scorecard". */
  title: string;
  /** The section's own subtitle, carried through verbatim. */
  subtitle?: string;
  /** Active filters, as the reader had them. Rendered under the title. */
  meta: ReportMeta[];
  columns: ReportColumn[];
  /**
   * Cells as strings — formatting is the SECTION's job, not the renderer's.
   * A "12 / 30" ratio, a "68%" and a plain count all reach the page exactly as
   * they read on screen, and the PDF never re-derives a number it was given.
   */
  rows: string[][];
  /**
   * Optional indent depth per row, for the nested sections. `0` is a top-level
   * row; `1` and `2` are the member and category rows under it. Length must
   * match `rows` when present.
   */
  depth?: number[];
  /** Shown above the table — "14 people · 212 tasks". */
  summary?: string;
}

/** `Altus_Delegation_Scorecard_24Aug2026.pdf` */
export function reportFilename(title: string, when: Date): string {
  const slug = title
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const day = String(when.getUTCDate()).padStart(2, "0");
  const month = when.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `Altus_${slug}_${day}${month}${when.getUTCFullYear()}.pdf`;
}

/**
 * `Overdue_Tasks_by_Person_Snapshot.pdf` — the EMAIL attachment name.
 *
 * Deliberately undated, unlike the download name. A download lands in a folder
 * beside last week's copy and needs the date to be told apart; an attachment
 * arrives in a thread that already carries its own timestamp, and a date in the
 * filename there just makes it longer to read on a phone.
 */
export function snapshotFilename(title: string): string {
  const slug = title
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${slug}_Snapshot.pdf`;
}

/** The WhatsApp message body. Kept here so the picker and any future caller
 *  cannot drift into two wordings. */
export function whatsappMessage(employeeName: string, sectionTitle: string): string {
  return `Hi ${employeeName}, attached is your ${sectionTitle} report snapshot from Altus Corp Dashboard.`;
}

/**
 * `https://api.whatsapp.com/send?phone=...&text=...`
 *
 * The phone is stripped to digits: the column stores E.164 (`+91 98…`), and the
 * API rejects the plus and any spacing it was saved with.
 */
export function whatsappShareUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
}

/** Guard for an untrusted payload arriving at either API route. */
export function isSectionReport(v: unknown): v is SectionReport {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<SectionReport>;
  return (
    typeof r.title === "string" &&
    r.title.length > 0 &&
    Array.isArray(r.meta) &&
    Array.isArray(r.columns) &&
    r.columns.length > 0 &&
    Array.isArray(r.rows) &&
    r.rows.every((row) => Array.isArray(row) && row.every((c) => typeof c === "string"))
  );
}
