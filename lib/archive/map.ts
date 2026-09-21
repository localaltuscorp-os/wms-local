import type { WorkspaceId } from "@/lib/workspaces";

/**
 * The Archive's ROUTING half — which section ids exist and which room each one
 * belongs to. Nothing else.
 *
 * Split out of sections.ts on purpose: `lib/workspaces.ts` needs the path →
 * room answer, and workspaces.ts is the app's one deliberately PURE module (no
 * icons, no server-only) because both the client nav and a route handler import
 * it. sections.ts carries lucide icons for the rail and the cards, so importing
 * *that* from workspaces.ts would drag an icon set into every importer of the
 * pure module. This file has no imports but a type, so the chain stays clean.
 *
 * The labels, icons and blurbs live in sections.ts, which builds on this.
 */

export const ARCHIVE_SECTION_IDS = [
  "tasks",
  "goals",
  "dcc",
  "incentives",
  "attendance",
  "leaves",
  "reimbursements",
  "kpis",
  "appraisals",
  "team-performance",
  "salary",
  "overtime",
  "hr-records",
  "sales",
  "plan",
] as const;

export type ArchiveSectionId = (typeof ARCHIVE_SECTION_IDS)[number];

/** Which room's rail stays on screen while you read this archive. */
export const ARCHIVE_SECTION_WORKSPACE: Record<ArchiveSectionId, WorkspaceId> = {
  tasks: "wms",
  goals: "goals",
  dcc: "employees",
  incentives: "employees",
  attendance: "employees",
  leaves: "employees",
  reimbursements: "employees",
  kpis: "productivity",
  appraisals: "productivity",
  "team-performance": "productivity",
  salary: "accounts",
  overtime: "accounts",
  "hr-records": "hr",
  sales: "sales",
  plan: "project-plan",
};

export function isArchiveSectionId(v: string | undefined | null): v is ArchiveSectionId {
  return !!v && v in ARCHIVE_SECTION_WORKSPACE;
}

/**
 * Which room an archive path belongs to, so the rail stays on the module whose
 * archive you are reading instead of falling back to the `aw` cookie.
 *
 * Segment-exact on purpose: `/archived` is the OLDER, unrelated WMS page (admin
 * archived tasks) and must not be swallowed by a `startsWith("/archive")`.
 */
export function archiveWorkspaceForPath(p: string): WorkspaceId | null {
  if (p !== "/archive" && !p.startsWith("/archive/")) return null;
  const id = p.slice("/archive/".length).split("/")[0];
  return isArchiveSectionId(id) ? ARCHIVE_SECTION_WORKSPACE[id] : null;
}

/**
 * WHOSE RECORDS — the Archive's two halves (Sir, 2026-09).
 *
 * `past` is the Archive's reason for existing: everyone who has left, so their
 * work has somewhere to live that is not the live screens. `present` is the
 * same fifteen readings pointed at people who are still here — the "what does
 * this person's whole trail look like" view that used to mean opening nine
 * modules one at a time.
 *
 * PAST IS THE DEFAULT, and stays the bare URL. Someone who clicks Archive is
 * looking for a leaver far more often than not, and a default that has to be
 * asked for is not a default.
 */
export const ARCHIVE_SCOPES = ["past", "present"] as const;

export type ArchiveScope = (typeof ARCHIVE_SCOPES)[number];

export const ARCHIVE_SCOPE_LABEL: Record<ArchiveScope, string> = {
  past: "Past Employees",
  present: "Present Employees",
};

export function isArchiveScope(v: string | undefined | null): v is ArchiveScope {
  return v === "past" || v === "present";
}

/** `?scope=` → a scope. Anything unrecognised reads as the default. */
export function parseArchiveScope(v: string | string[] | undefined): ArchiveScope {
  const raw = Array.isArray(v) ? v[0] : v;
  return isArchiveScope(raw) ? raw : "past";
}

/**
 * The query string for an Archive link. `past` and "everyone" are the defaults,
 * so they are left OUT — the plain `/archive/dcc` is the page you land on, and
 * a URL only carries what someone actually chose.
 */
export function archiveQuery(opts: { scope?: ArchiveScope; employeeId?: string }): string {
  const parts: string[] = [];
  if (opts.scope && opts.scope !== "past") parts.push(`scope=${opts.scope}`);
  if (opts.employeeId) parts.push(`emp=${encodeURIComponent(opts.employeeId)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * WHAT THE ARCHIVE CAN ACT ON.
 *
 * A row shown in the Archive is either something somebody PUT AWAY — it has an
 * archive flag of its own — or a record that simply belongs to the person. Only
 * the first kind can be taken back out or thrown away from here, so only those
 * tables get a kind, and the server action's whitelist is keyed by it: an id
 * arriving with a kind is the only way this surface can write anything.
 *
 * `team-performance` is the one kind that unarchives but never deletes: the row
 * behind it is an EMPLOYEE, put away from one board (migration 0232). Taking it
 * back out is undoing that; deleting it would destroy the person's record over
 * a list preference, so app/(app)/archive/actions.ts refuses it outright.
 */
export const ARCHIVE_RECORD_KINDS = [
  "task",
  "weekly-goal",
  "goal",
  "dcc-item",
  "module-submission",
  "kpi-assignment",
  "employee-document",
  "hr-ticket",
  "project-node",
  "team-performance",
] as const;

export type ArchiveRecordKind = (typeof ARCHIVE_RECORD_KINDS)[number];

export function isArchiveRecordKind(v: string | undefined | null): v is ArchiveRecordKind {
  return !!v && (ARCHIVE_RECORD_KINDS as readonly string[]).includes(v);
}
