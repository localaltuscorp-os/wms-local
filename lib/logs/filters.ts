/**
 * THE LOGS FILTER MODEL — pure parsing of the Logs URL into typed filters.
 *
 * Filter state lives entirely in the URL, so a filtered view can be refreshed,
 * shared or bookmarked, and paging/sorting/exporting never resets it. This
 * module has no `server-only` and no DB, so both the server page and the client
 * filter bar share it — the parser and the writer cannot drift.
 */

import {
  isPermissionNodeKey,
  nodeChain,
  permissionNode,
} from "@/lib/permissions/catalog";
import { isLogEventType } from "@/lib/logs/events";

export const SORT_OPTIONS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "person", label: "Person" },
  { id: "module", label: "Module" },
  { id: "event", label: "Event" },
  { id: "status", label: "Status" },
] as const;
export type LogSort = (typeof SORT_OPTIONS)[number]["id"];

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export interface LogFilters {
  q: string;
  functionIds: string[];
  employeeIds: string[];
  entityIds: string[];
  /** Selected permission-catalogue node keys (module or page). */
  nodes: string[];
  eventTypes: string[];
  statuses: string[];
  from: string | null; // ISO datetime, inclusive
  to: string | null; // ISO datetime, inclusive
  sort: LogSort;
  page: number;
  pageSize: number;
}

export const EMPTY_FILTERS: LogFilters = {
  q: "",
  functionIds: [],
  employeeIds: [],
  entityIds: [],
  nodes: [],
  eventTypes: [],
  statuses: [],
  from: null,
  to: null,
  sort: "newest",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

const split = (v: string | undefined): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

const isSort = (v: string | undefined): v is LogSort =>
  !!v && (SORT_OPTIONS as readonly { id: string }[]).some((s) => s.id === v);

function parsePage(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parsePageSize(v: string | undefined): number {
  const n = Number(v);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Read the Logs URL search params into typed filters. Invalid values drop. */
export function parseLogFilters(
  searchParams: Record<string, string | string[] | undefined>,
): LogFilters {
  const get = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const sortRaw = get("sort");

  return {
    q: (get("q") ?? "").trim().slice(0, 200),
    functionIds: split(get("fn")),
    employeeIds: split(get("emp")),
    entityIds: split(get("ent")),
    nodes: split(get("node")).filter(isPermissionNodeKey),
    eventTypes: split(get("event")).filter(isLogEventType),
    statuses: split(get("status")),
    from: parseDate(get("from")),
    to: parseDate(get("to")),
    sort: isSort(sortRaw) ? sortRaw : "newest",
    page: parsePage(get("page")),
    pageSize: parsePageSize(get("ps")),
  };
}

/** Serialize filters back to URL params (the client's only state writes). */
export function filtersToParams(f: LogFilters): URLSearchParams {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | string[] | null) => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
      return;
    }
    sp.set(k, Array.isArray(v) ? v.join(",") : v);
  };
  set("q", f.q);
  set("fn", f.functionIds);
  set("emp", f.employeeIds);
  set("ent", f.entityIds);
  set("node", f.nodes);
  set("event", f.eventTypes);
  set("status", f.statuses);
  set("from", f.from);
  set("to", f.to);
  if (f.sort !== "newest") set("sort", f.sort);
  if (f.page > 1) set("page", String(f.page));
  if (f.pageSize !== DEFAULT_PAGE_SIZE) set("ps", String(f.pageSize));
  return sp;
}

/** How many individual filter facets are active (for the "N active" chip). */
export function activeFilterCount(f: LogFilters): number {
  let n = 0;
  if (f.q) n += 1;
  n += f.functionIds.length + f.employeeIds.length + f.entityIds.length + f.nodes.length;
  n += f.eventTypes.length + f.statuses.length;
  if (f.from || f.to) n += 1;
  return n;
}

export interface NodeMatch {
  module: string;
  page: string | null;
}

/**
 * Expand a set of selected catalogue node keys into (module, page) match rules.
 * A module node matches every row with that module label; a page node matches
 * that module AND page label. Returns [] when no nodes are selected.
 */
export function nodesToMatches(nodes: string[]): NodeMatch[] {
  const out: NodeMatch[] = [];
  for (const key of nodes) {
    const chain = nodeChain(key);
    if (chain.length === 0) continue;
    const moduleLabel = permissionNode(chain[0]!)?.label ?? "";
    const leaf = permissionNode(chain[chain.length - 1]!)?.label ?? "";
    if (chain.length === 1) {
      out.push({ module: moduleLabel, page: null });
    } else {
      out.push({ module: moduleLabel, page: leaf });
    }
  }
  return out;
}

/** The quick-range presets. "hours-N" resolves client-side into from/to. */
export const QUICK_RANGES = [
  { id: "hours-1", label: "Past 1 hour", ms: 1 * 60 * 60 * 1000 },
  { id: "hours-3", label: "Past 3 hours", ms: 3 * 60 * 60 * 1000 },
  { id: "hours-6", label: "Past 6 hours", ms: 6 * 60 * 60 * 1000 },
  { id: "hours-12", label: "Past 12 hours", ms: 12 * 60 * 60 * 1000 },
  { id: "hours-24", label: "Past 24 hours", ms: 24 * 60 * 60 * 1000 },
  { id: "days-3", label: "Past 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { id: "days-7", label: "Past 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "days-30", label: "Past month", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "days-90", label: "Past quarter", ms: 90 * 24 * 60 * 60 * 1000 },
  { id: "days-365", label: "Past year", ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

export type QuickRangeId = (typeof QUICK_RANGES)[number]["id"];

export function quickRangeMs(id: string): number | null {
  const r = (QUICK_RANGES as readonly { id: string; ms: number }[]).find((x) => x.id === id);
  return r ? r.ms : null;
}
