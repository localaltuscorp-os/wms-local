/**
 * Project Plan — the level model, the automatic reference numbering and the
 * duration / date helpers the inline editors use.
 *
 * Client-SAFE on purpose (no `server-only`, no db import): the hierarchy table
 * derives every REF label in the browser as rows are added, moved and deleted,
 * and the server actions re-use the same predicates to validate a parent/child
 * pair. One copy of the rules, so the screen and the writes cannot disagree.
 */

export const PLAN_KINDS = [
  "project",
  "milestone",
  "result",
  "action",
  "sub_action",
  "sub_sub_action",
] as const;

export type PlanKind = (typeof PLAN_KINDS)[number];

/** Depth in the tree, 0-based — also the row's indent step. */
export const KIND_DEPTH: Record<PlanKind, number> = {
  project: 0,
  milestone: 1,
  result: 2,
  action: 3,
  sub_action: 4,
  sub_sub_action: 5,
};

export const KIND_LABEL: Record<PlanKind, string> = {
  project: "Project",
  milestone: "Milestone",
  result: "Result",
  action: "Action",
  sub_action: "Sub-Action",
  sub_sub_action: "Sub-Sub-Action",
};

/** The kind a row of this kind may contain, or null at the deepest level. */
export const CHILD_KIND: Record<PlanKind, PlanKind | null> = {
  project: "milestone",
  milestone: "result",
  result: "action",
  action: "sub_action",
  sub_action: "sub_sub_action",
  sub_sub_action: null,
};

/** The kind a row of this kind must sit under, or null at the top level. */
export const PARENT_KIND: Record<PlanKind, PlanKind | null> = {
  project: null,
  milestone: "project",
  result: "milestone",
  action: "result",
  sub_action: "action",
  sub_sub_action: "sub_action",
};

/**
 * The three EXECUTABLE levels. These are the rows that carry real work, so
 * these — and only these — get a linked task row (tasks.project_node_id) and
 * therefore appear in WMS and on the Google Calendar. Project / Milestone /
 * Result are containers: they hold dates as plan metadata, but
 * they never become tasks, because a milestone is not something anyone "does".
 */
export const EXECUTABLE_KINDS: readonly PlanKind[] = ["action", "sub_action", "sub_sub_action"];

export function isExecutable(kind: PlanKind): boolean {
  return EXECUTABLE_KINDS.includes(kind);
}

/**
 * The levels that get a LINKED WMS TASK — the three executable ones, plus
 * Result.
 *
 * DELIBERATELY NOT THE SAME SET AS `EXECUTABLE_KINDS`, and the difference is
 * the whole point. A Result was asked to show up in the task list: people put
 * an owner and a target date on one and expect to see it in WMS. But a Result
 * is still the level whose PROGRESS is counted from the actions underneath it
 * ("0 out of 3 actions"), and that number is only trustworthy while it is
 * derived rather than self-reported.
 *
 * So the two questions were split:
 *
 *   hasTask()       does this row get a `tasks` record?   result + executables
 *   isExecutable()  does this row report its own status,  executables only
 *                   priority, notes and progress from
 *                   that task rather than from the plan?
 *
 * A Result therefore gains a task carrying its title, doer, due date and
 * schedule, and keeps its status, priority, notes and derived progress on the
 * plan row where the rest of the module already reads them. Widening
 * `isExecutable` instead would have moved all four in one go and made a
 * container's progress a self-report competing with its own children.
 */
export const TASK_KINDS: readonly PlanKind[] = ["result", ...EXECUTABLE_KINDS];

export function hasTask(kind: PlanKind): boolean {
  return TASK_KINDS.includes(kind);
}

/**
 * The levels that carry a SCHEDULE of their own — a start, an end, and the
 * duration derived from the two.
 *
 * A Project and a Milestone are dated BY THE WORK UNDERNEATH THEM, not by a
 * block someone drew on a calendar: a project runs from its first action to its
 * last, and a stored pair of dates on the container is free to disagree with
 * that the moment anything below it moves. So neither the create form nor the
 * register offers those fields for them — the columns would be a column of
 * dashes, and any value in them would be a second opinion about a date the plan
 * already knows.
 *
 * ONE TABLE, THREE SURFACES: the new-item dialog hides its Schedule section,
 * the register drops Start / End / Duration, and the edit dialog drops the same
 * fields — all reading this, so they cannot drift.
 */
export const SCHEDULED_KINDS: readonly PlanKind[] = [
  "result",
  "action",
  "sub_action",
  "sub_sub_action",
];

export function hasSchedule(kind: PlanKind): boolean {
  return SCHEDULED_KINDS.includes(kind);
}

export function isPlanKind(v: string | null | undefined): v is PlanKind {
  return !!v && (PLAN_KINDS as readonly string[]).includes(v);
}

// ── Reference numbering ──────────────────────────────────────────────────────
//
// Numbering is DERIVED from a row's position among its siblings, never stored.
// That is the whole point: delete Action 2 of 5 and the rest renumber on the
// next render with no write and no chance of a stored label drifting from the
// tree.
//
// There are TWO refs, and the difference matters:
//
//   refFor()      the SHORT label the screen shows. Read on its own line in a
//                 tree that already makes the parent obvious.
//
//                   Project        P1, P2, P3 …
//                   Milestone      M1, M2, M3 …
//                   Result         RA, RB … RZ, RAA …   (spreadsheet letters)
//                   Action         A1, A2, A3 …
//                   Sub-Action     SA3.1, SA3.2 …       (parent ordinal + own)
//                   Sub-Sub-Action SSA3.1.1 …
//
//   fullRefFor()  the TRACEABILITY path — every ancestor concatenated, e.g.
//                 P3M3RDA5SA1. Unique across the whole plan, so it can be
//                 quoted in an email or a spreadsheet and still resolve. It is
//                 deliberately NOT the on-screen label: it gets long fast, and
//                 a column of P3M3RDA5SA1 strings is unreadable. Show it in a
//                 detail panel, a tooltip or an export — not in every row.
//
// NEITHER is a relationship. Both are display artefacts derived from
// parent_id + sibling order; the database relationship is parent_id alone, and
// nothing may ever parse a ref to find a parent.

const ROMAN: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** 1 → "I", 4 → "IV", 14 → "XIV". Guards n < 1 so a bad index can't hang. */
export function toRoman(n: number): string {
  if (!Number.isFinite(n) || n < 1) return String(n);
  let rest = Math.floor(n);
  let out = "";
  for (const [value, numeral] of ROMAN) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

/** 1 → "A", 26 → "Z", 27 → "AA", 28 → "AB" (spreadsheet-style, 1-based). */
export function toLetters(n: number): string {
  if (!Number.isFinite(n) || n < 1) return String(n);
  let rest = Math.floor(n);
  let out = "";
  while (rest > 0) {
    const rem = (rest - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    rest = Math.floor((rest - 1) / 26);
  }
  return out;
}

/**
 * The REF label for one row, from its kind, its 1-based position among its
 * siblings, and its parent's already-computed ref.
 *
 * The deep levels append to the parent ref rather than recomputing a path, so
 * 1.1.1 is literally "parent 1.1" + ".1" and a renumber high in the tree flows
 * all the way down for free.
 */
export function refFor(kind: PlanKind, index1: number, parentRef: string | null): string {
  switch (kind) {
    case "project":
      return `P${index1}`;
    case "milestone":
      return `M${index1}`;
    case "result":
      return `R${toLetters(index1)}`;
    case "action":
      return `A${index1}`;
    // SA3.1 — the PARENT's ordinal, then this row's. The parent ref arrives as
    // "A3", so its digits are what follow the SA. Falls back to a bare ordinal
    // when there is no parent ref to hang off, which only happens on a row
    // whose ancestor was archived out from under it.
    case "sub_action":
      return `SA${joinOrdinals(parentRef, index1)}`;
    case "sub_sub_action":
      return `SSA${joinOrdinals(parentRef, index1)}`;
  }
}

/** "A3" + 1 → "3.1"; "SA3.2" + 4 → "3.2.4"; null + 2 → "2". */
function joinOrdinals(parentRef: string | null, index1: number): string {
  const digits = (parentRef ?? "").replace(/^[A-Z]+/, "");
  return digits ? `${digits}.${index1}` : String(index1);
}

/**
 * The full traceability path — P3M3RDA5SA1.
 *
 * Built by appending this row's own segment to the parent's full ref, so a
 * renumber anywhere above flows down for free, exactly like refFor. The
 * segments are chosen so the string stays parseable by eye: P/M/R/A/SA/SSA
 * prefixes with the ordinal (or letter) after each.
 *
 * Not a key, not a relationship, and never stored — see the note above.
 */
export function fullRefFor(
  kind: PlanKind,
  index1: number,
  parentFullRef: string | null,
): string {
  const segment =
    kind === "project"
      ? `P${index1}`
      : kind === "milestone"
        ? `M${index1}`
        : kind === "result"
          ? `R${toLetters(index1)}`
          : kind === "action"
            ? `A${index1}`
            : kind === "sub_action"
              ? `SA${index1}`
              : `SSA${index1}`;
  return parentFullRef ? `${parentFullRef}${segment}` : segment;
}

// ── Duration ─────────────────────────────────────────────────────────────────

/**
 * "2h 30m" / "2 h 30 m" / "2:30" / "90" / "1.5h" → whole minutes. Returns null
 * for blank, and for anything it cannot read — a bad string must clear the
 * field rather than silently store a wrong number.
 */
export function parseDuration(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;

  // "2:30" — h:mm.
  const colon = /^(\d+):([0-5]?\d)$/.exec(s);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  // "2h 30m" / "2h" / "30m" / "1.5h", in either order, either unit optional.
  const h = /(\d+(?:\.\d+)?)\s*h/.exec(s);
  const m = /(\d+(?:\.\d+)?)\s*m/.exec(s);
  if (h || m) {
    const mins = Math.round((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0));
    return mins > 0 ? mins : null;
  }

  // Bare number = minutes.
  const bare = /^\d+(?:\.\d+)?$/.exec(s);
  if (bare) {
    const mins = Math.round(Number(bare[0]));
    return mins > 0 ? mins : null;
  }
  return null;
}

/** 150 → "2h 30m", 45 → "45m", 120 → "2h", null → "". */
export function formatDuration(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// ── Date/time helpers (local, never UTC-shifted) ─────────────────────────────

/** Date → "YYYY-MM-DD" in LOCAL time (toISOString would shift the day east of UTC). */
export function toYmd(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date → "HH:MM" local, for the FROM / TO time inputs. */
export function toHm(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/**
 * Combine a "YYYY-MM-DD" and an "HH:MM" into a local Date. Either may be blank:
 * with no date there is no instant to build, so it returns null and the caller
 * clears the column.
 */
export function combineDateTime(ymd: string, hm: string): Date | null {
  if (!ymd) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const [h, mi] = (hm || "00:00").split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// ── Display typography ───────────────────────────────────────────────────────

/**
 * How each level is SET, per the brief. One table, imported by every surface
 * that draws a plan row, so the hierarchy reads the same on the table, the
 * kanban card and the pickers without three copies of the rules drifting apart.
 *
 *   Project        bold + italic + CAPS   14px   ← largest, the whole point
 *   Milestone      bold + CAPS            14px
 *   Result         italic                 12px
 *   Action         normal                 12px
 *   Sub-Action     italic                 11px
 *   Sub-Sub-Action italic                 10px   (one step on again)
 *
 * Every size is TWO points up from where it started (12/12/10/10/9/8), lifted a
 * point at a time. The plan is read far more than it is edited and the original
 * scale was small enough to squint at; the STEPS between levels never changed,
 * so the hierarchy still reads by weight and size the way it did — just
 * legibly. Move the whole column together if it moves again: the steps are the
 * design, the absolute sizes are not.
 *
 * `caps` is a TRANSFORM, not a rewrite: the stored name keeps the case the
 * author typed, so an export, a search and the edit box all still show
 * "AICL WMS" as written rather than a shouted copy of it.
 */
export interface LevelStyle {
  fontSize: number;
  bold: boolean;
  italic: boolean;
  caps: boolean;
}

export const LEVEL_STYLE: Record<PlanKind, LevelStyle> = {
  project:        { fontSize: 14, bold: true,  italic: true,  caps: true  },
  milestone:      { fontSize: 14, bold: true,  italic: false, caps: true  },
  result:         { fontSize: 12, bold: false, italic: true,  caps: false },
  action:         { fontSize: 12, bold: false, italic: false, caps: false },
  sub_action:     { fontSize: 11, bold: false, italic: true,  caps: false },
  sub_sub_action: { fontSize: 10, bold: false, italic: true,  caps: false },
};

/** The style table as inline CSS, ready for a `style={}` prop. */
export function levelTextStyle(kind: PlanKind): {
  fontSize: number;
  fontWeight: number;
  fontStyle: "italic" | "normal";
  textTransform: "uppercase" | "none";
} {
  const s = LEVEL_STYLE[kind];
  return {
    fontSize: s.fontSize,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textTransform: s.caps ? "uppercase" : "none",
  };
}

// ── Dates ────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-06-12" | Date → "12-Jun-2026". Blank for null or an unreadable value. */
export function formatPlanDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  // A bare YYYY-MM-DD is read as a LOCAL day, not parsed as UTC midnight —
  // `new Date("2026-06-12")` is UTC and renders as the 11th west of Greenwich.
  const dt =
    typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
      : typeof d === "string"
        ? new Date(d)
        : d;
  if (Number.isNaN(dt.getTime())) return "";
  return `${String(dt.getDate()).padStart(2, "0")}-${MONTHS[dt.getMonth()]}-${dt.getFullYear()}`;
}

/**
 * Whole days from start to end, INCLUSIVE of both — a job that starts and ends
 * on the same day lasts one day, not zero. Null unless both ends are known.
 *
 * Compared on local calendar days rather than instants, so a start at 18:00 and
 * an end at 09:00 two days later is 3 days, not "2.6 rounded".
 */
export function durationDays(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const a = typeof start === "string" ? new Date(start) : start;
  const b = typeof end === "string" ? new Date(end) : end;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / 86_400_000) + 1;
}
