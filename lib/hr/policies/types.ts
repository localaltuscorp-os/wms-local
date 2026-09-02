/**
 * HR POLICIES — the declarative policy-document model.
 *
 * This mirrors the letter engine (lib/hr/letters/types.ts) but for LONG, legal,
 * multi-page policy documents (POSH, Exit, Anti-Harassment, …). Where a letter is
 * a stream of prose with inline EDITABLE red fields, a policy is FROZEN legal text
 * organised into numbered SECTIONS, each holding an ordered list of body nodes:
 * paragraphs, sub-headings, bullet lists, bordered tables (a KEY:VALUE doc-code
 * box, 2-column PRINCIPLE tables), a COMMITTEE roster table (Position | Name |
 * Email | Contact) and a numbered WORKFLOW with an optional "case closure" step.
 *
 * A policy is authored ONCE as a `PolicyDoc`: identity + a doc-code header
 * (`docCode`, `effectiveDate`, `version`, `owner`, `registeredOffice`, `hrEmail`),
 * an ordered `sections` array, and a shared `declaration` block (every policy
 * carries the SAME bottom acknowledgement text — heading + statement; consent
 * itself is captured by the in-app Sign flow, not by printed sign-off lines).
 *
 * ── Read + sign, NOT a form ────────────────────────────────────────────────
 * Policies are READ and then SIGNED on day one (via the existing
 * document_signatures / DigiLocker flow). There is deliberately no inline
 * editing here — the body is legal text, identical on every render. The only
 * variable is the paying `entityDefault` (which the reader can swap live to
 * re-brand the letterhead).
 *
 * PURE + CLIENT-SAFE: no db / node / server-only imports. The client reader, the
 * page and any print/PDF path all import this, so it must stay load-neutral.
 *
 * ── Authoring quick-reference ──────────────────────────────────────────────
 *   import { heading, p, sub, ul, table, committee, workflow, declaration }
 *     from "./types";
 *
 *   const posh: PolicyDoc = {
 *     key: "posh",
 *     title: "Prevention of Sexual Harassment (POSH) Policy",
 *     docCode: "ALT/HR/POSH/001",
 *     effectiveDate: "1 August 2026",
 *     version: "1.0",
 *     owner: "Human Resources",
 *     registeredOffice: "Sacred Space, C-6, Goregaon (E), Mumbai 63",
 *     hrEmail: "hr@altuscorp.in",
 *     entityDefault: "altus-corp",
 *     summary: "A short intro shown under the title.",
 *     sections: [
 *       heading("Purpose & Scope",
 *         p("This policy sets out …"),
 *         ul("Applies to all employees.", "Covers the workplace and off-site events."),
 *       ),
 *       heading("Guiding Principles",
 *         table({
 *           variant: "principle",
 *           columns: ["Principle", "What it means"],
 *           rows: [["Zero tolerance", "No form of harassment is condoned."]],
 *         }),
 *       ),
 *       heading("Internal Committee",
 *         committee([
 *           { position: "Presiding Officer", name: "…", email: "…", contact: "…" },
 *         ]),
 *       ),
 *       heading("Complaint Redressal Workflow",
 *         workflow(
 *           ["Written complaint to the IC within 3 months.",
 *            { text: "IC inquiry", note: "completed within 90 days" }],
 *           "Case closed; outcome recorded and communicated to both parties.",
 *         ),
 *       ),
 *     ],
 *     declaration: declaration(),
 *   };
 */

import type { EntityId } from "@/lib/hr/entities";

/* ------------------------------------------------------------------ */
/* Body nodes — the atoms of a section                                  */
/* ------------------------------------------------------------------ */

/** A body paragraph. Optional `lead` renders as a bold run-in at the start. */
export interface ParagraphNode {
  kind: "p";
  text: string;
  /** Bold lead-in printed before the text (e.g. "Definition — "). */
  lead?: string;
}

/** A sub-heading within a section (smaller than the section heading). */
export interface SubHeadingNode {
  kind: "sub";
  text: string;
}

/** A bullet list — each item is a plain string. */
export interface BulletsNode {
  kind: "ul";
  items: string[];
}

/**
 * How a table is styled:
 *   keyval    — the doc-code / metadata box: 2 columns, label | value, no header.
 *   principle — a 2-column reference table with a header row (Principle | Desc).
 *   grid      — a generic N-column table with an optional header row.
 */
export type TableVariant = "keyval" | "principle" | "grid";

/** A bordered table. `columns` (header row) is optional for keyval boxes. */
export interface TableNode {
  kind: "table";
  variant: TableVariant;
  /** Header cells; omit for a keyval box. */
  columns?: string[];
  /** Body rows; each row is an array of cell strings. */
  rows: string[][];
}

/** One member row in a committee roster. */
export interface CommitteeMember {
  position: string;
  name: string;
  email?: string;
  contact?: string;
}

/** A committee / members table (Position | Name | Email | Contact). */
export interface CommitteeNode {
  kind: "committee";
  members: CommitteeMember[];
  /** Optional note printed above the table (e.g. quorum / tenure). */
  caption?: string;
}

/** One numbered step of a workflow. */
export interface WorkflowStep {
  text: string;
  /** A muted qualifier printed under the step (timeline, owner, …). */
  note?: string;
}

/**
 * A numbered workflow / process. `closure` is the terminal "case closure" node,
 * rendered distinctly (a checkmarked end cap) after the last numbered step.
 */
export interface WorkflowNode {
  kind: "workflow";
  steps: WorkflowStep[];
  closure?: string;
}

/** One code → meaning row of a legend (e.g. attendance status codes). */
export interface LegendItem {
  /** The short code / abbreviation, e.g. "HD", "WFH". */
  code: string;
  /** What the code means, e.g. "Half Day". */
  meaning: string;
}

/**
 * A LEGEND — a premium code-chip grid (each code rendered as a branded chip
 * beside its meaning). Used for reference keys like the attendance status codes.
 */
export interface LegendNode {
  kind: "legend";
  items: LegendItem[];
  /** Optional note printed above the grid. */
  caption?: string;
}

/** Any content node inside a section body. */
export type PolicyNode =
  | ParagraphNode
  | SubHeadingNode
  | BulletsNode
  | TableNode
  | CommitteeNode
  | WorkflowNode
  | LegendNode;

/* ------------------------------------------------------------------ */
/* Section + declaration + the document                                 */
/* ------------------------------------------------------------------ */

/** A numbered policy section: a heading + an ordered list of body nodes. */
export interface PolicySection {
  heading: string;
  nodes: PolicyNode[];
}

/**
 * The shared bottom acknowledgement block. EVERY policy carries the same one
 * (built via `declaration()`), so it stays consistent across documents. The
 * reader agrees to it on day one through the document_signatures flow.
 *
 * TEXT ONLY — heading + statement. There are deliberately NO printed sign-off
 * lines (Employee Name / ID / Department / Signature / Date) and no HR-receipt
 * or founder-approval boxes: consent is captured in-app, and blank pen-and-paper
 * rules on the rendered policy were a second, unsigned record of the same thing.
 */
export interface DeclarationBlock {
  /** Section heading, e.g. "Declaration & Acknowledgement". */
  heading: string;
  /** The "I have read and agree…" acknowledgement statement. */
  statement: string;
}

/** The default acknowledgement — reused by every policy via `declaration()`. */
export const DEFAULT_DECLARATION: DeclarationBlock = {
  heading: "Declaration & Acknowledgement",
  statement:
    "I hereby acknowledge that I have read, understood and agree to abide by the terms of this policy. I understand that this policy forms part of my terms of engagement, and that any breach may attract disciplinary action, up to and including termination of employment, in accordance with the Firm's rules and applicable law.",
};

/**
 * A complete policy document. Identity + doc-code header + ordered sections +
 * a shared declaration. The doc-code header (docCode / effectiveDate / version /
 * owner / registeredOffice / hrEmail) is rendered as the KEY:VALUE box at the top
 * of the document by <PolicyDocument>.
 */
export interface PolicyDoc {
  /** Stable identity + URL segment (`/hr/policies/<key>`). Unique across policies. */
  key: string;
  /** Full title printed on the document + the card. */
  title: string;
  /** Document control code, e.g. "ALT/HR/POSH/001". */
  docCode: string;
  /** Effective-from date (human string, e.g. "1 August 2026"). */
  effectiveDate: string;
  /** Version, e.g. "1.0". */
  version: string;
  /** Policy owner / custodian, e.g. "Human Resources". */
  owner: string;
  /** Registered office line printed in the doc-code box. */
  registeredOffice: string;
  /** HR contact email printed in the doc-code box + used for grievance routing. */
  hrEmail: string;
  /** The paying entity the letterhead defaults to (reader can swap it). */
  entityDefault?: EntityId;
  /** One-line description for the policy card. */
  blurb?: string;
  /** A short intro paragraph shown under the title, above the first section. */
  summary?: string;
  /** The ordered, numbered sections. */
  sections: PolicySection[];
  /** The shared bottom sign-off (defaults to DEFAULT_DECLARATION via `declaration()`). */
  declaration?: DeclarationBlock;
}

/* ------------------------------------------------------------------ */
/* Authoring builders — terse helpers so policies read like a document  */
/* ------------------------------------------------------------------ */

/** A section = a heading followed by its body nodes. */
export const heading = (heading: string, ...nodes: PolicyNode[]): PolicySection => ({
  heading,
  nodes,
});

/** A paragraph. Pass a `lead` for a bold run-in. */
export const p = (text: string, lead?: string): ParagraphNode => ({ kind: "p", text, lead });

/** A sub-heading node within a section. */
export const sub = (text: string): SubHeadingNode => ({ kind: "sub", text });

/** A bullet list from item strings. */
export const ul = (...items: string[]): BulletsNode => ({ kind: "ul", items });

/**
 * A bordered table. `variant` defaults to "grid".
 *   table({ variant: "keyval", rows: [["Document Code", "ALT/HR/POSH/001"]] })
 *   table({ variant: "principle", columns: ["Principle", "Description"], rows: […] })
 */
export const table = (spec: {
  variant?: TableVariant;
  columns?: string[];
  rows: string[][];
}): TableNode => ({
  kind: "table",
  variant: spec.variant ?? "grid",
  columns: spec.columns,
  rows: spec.rows,
});

/** A committee roster (Position | Name | Email | Contact). */
export const committee = (members: CommitteeMember[], caption?: string): CommitteeNode => ({
  kind: "committee",
  members,
  caption,
});

/** A legend / key — code chips beside their meanings. */
export const legend = (items: LegendItem[], caption?: string): LegendNode => ({
  kind: "legend",
  items,
  caption,
});

/**
 * A numbered workflow. Steps may be plain strings or `{ text, note }`. Pass a
 * `closure` string for the terminal "case closure" end cap.
 */
export const workflow = (
  steps: Array<string | WorkflowStep>,
  closure?: string,
): WorkflowNode => ({
  kind: "workflow",
  steps: steps.map((s) => (typeof s === "string" ? { text: s } : s)),
  closure,
});

/** The shared bottom acknowledgement. Override any field, or call bare for the default. */
export const declaration = (over?: Partial<DeclarationBlock>): DeclarationBlock => ({
  ...DEFAULT_DECLARATION,
  ...over,
});
