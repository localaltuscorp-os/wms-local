import Link from "next/link";
import type { Route } from "next";
import { UserCheck, UserMinus } from "lucide-react";
import { ArchiveTablesClient } from "./archive-tables-client";
import {
  ARCHIVE_SCOPES,
  ARCHIVE_SCOPE_LABEL,
  archiveQuery,
  type ArchiveScope,
  type ArchiveSection,
} from "@/lib/archive/sections";
import type { ArchiveTable } from "@/lib/queries/archive";
import { formatCount } from "@/lib/format";

export { ArchivePeopleFilter } from "./archive-people-filter";

/**
 * The Archive's shared furniture: the Past / Present switch and the room's
 * section chips, both server-rendered here, plus the two client islands next
 * door — the person filter (it carries a search box) and the tables (search,
 * Unarchive, Delete).
 *
 * WHAT STAYS IN THIS FILE IS A LINK, not state. Choosing a half, a section or a
 * person is NAVIGATION: the choice lives in the query string, so a filtered
 * view is a URL somebody can send to Accounts or paste into a mail, and it all
 * works before any JavaScript loads. Only the things that genuinely cannot be
 * URLs — typing into a search box, pressing Delete twice — went client-side.
 */

const CHIP_ACTIVE: React.CSSProperties = {
  borderColor: "var(--color-altus-red)",
  background: "color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card))",
  color: "var(--color-altus-red-deep, #A80400)",
  fontWeight: 700,
};

const SCOPE_ICON = { past: UserMinus, present: UserCheck } as const;

function href(base: string, opts: { scope?: ArchiveScope; employeeId?: string }): Route {
  return `${base}${archiveQuery(opts)}` as Route;
}

/**
 * PAST EMPLOYEES | PRESENT EMPLOYEES — the Archive's two halves (Sir, 2026-09).
 *
 * Switching sides DROPS `?emp=`, deliberately: a person is on one side of that
 * line or the other, so carrying a leaver's id into the Present view could only
 * ever land on "not in this view". You switch halves, then pick a person.
 */
export function ArchiveScopeSwitch({
  scope,
  basePath,
  counts,
}: {
  scope: ArchiveScope;
  basePath: string;
  /** How many people each side holds — the switch says what is behind it. */
  counts?: Record<ArchiveScope, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ARCHIVE_SCOPES.map((s) => {
        const Icon = SCOPE_ICON[s];
        const active = s === scope;
        const n = counts?.[s];
        return (
          <Link
            key={s}
            href={href(basePath, { scope: s })}
            className="filter-chip text-[12.5px]"
            style={active ? CHIP_ACTIVE : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={14} strokeWidth={2.2} />
            {ARCHIVE_SCOPE_LABEL[s]}
            {typeof n === "number" && (
              <span className="text-mono text-[11px] text-ink-soft">{formatCount(n)}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** The sections of the room you are standing in — one chip each, current one lit. */
export function ArchiveSectionChips({
  sections,
  activeId,
  scope,
  employeeId,
}: {
  sections: ArchiveSection[];
  activeId: string;
  scope: ArchiveScope;
  employeeId?: string;
}) {
  if (sections.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sections.map((s) => {
        const active = s.id === activeId;
        return (
          <Link
            key={s.id}
            href={href(`/archive/${s.id}`, { scope, employeeId })}
            className="filter-chip text-[12.5px]"
            style={active ? CHIP_ACTIVE : undefined}
            aria-current={active ? "page" : undefined}
          >
            <s.Icon size={14} strokeWidth={2.2} />
            {s.short}
          </Link>
        );
      })}
    </div>
  );
}

/** One module's tables, in the order its loader returned them. */
export function ArchiveTables({
  tables,
  activePeople,
  emptyTitle,
  emptyLine,
}: {
  tables: ArchiveTable[];
  activePeople?: import("@/lib/queries/archive").ArchivePerson[];
  emptyTitle?: string;
  emptyLine?: string;
}) {
  if (tables.length === 0) {
    return (
      <EmptyPanel
        title={emptyTitle ?? "Nothing to show"}
        line={
          emptyLine ??
          "Nobody is on this side of the Archive yet, so there are no records to read here."
        }
      />
    );
  }
  // The rows themselves are a client island: they carry a search box and, where
  // a record was put away by hand, Unarchive and Delete.
  return <ArchiveTablesClient tables={tables} activePeople={activePeople} />;
}

export function EmptyPanel({ title, line }: { title: string; line: string }) {
  return (
    <section
      className="rounded-section border border-hairline bg-surface-card px-6 py-14 text-center wg-rise"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <h2 className="text-[16px] font-black tracking-tight text-ink-strong">{title}</h2>
      <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] font-medium text-ink-muted">{line}</p>
    </section>
  );
}
