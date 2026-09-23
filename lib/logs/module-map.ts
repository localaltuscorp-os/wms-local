/**
 * ROUTE → (MODULE, PAGE) — derived from the permission catalogue, not a second
 * definition.
 *
 * The catalogue (`lib/permissions/catalog.ts`) is the one tree the whole app
 * already uses for modules/sub-modules/sub-sub-modules, with stable keys and
 * labels. `classifyRoute` walks that same tree, so the module/page names a log
 * row carries are the names the admin already sees in the permission matrix.
 * No new module registry is invented here.
 *
 * PURE — no `server-only`, no DB, so the client tracker can classify a route
 * before sending it (the server re-classifies on ingest regardless).
 */

import {
  allPermissionNodes,
  nodeChain,
  nodeKeyForPath,
  permissionNode,
  type PermissionNode,
} from "@/lib/permissions/catalog";

export interface RouteClass {
  /** The module (workspace) label, e.g. "WMS". */
  module: string;
  /** The page (sub-module / sub-sub-module) label, e.g. "Tasks" or "Task Detail". */
  page: string;
  /** The deepest node key, e.g. "wms.tasks.kanban". */
  key: string;
}

/**
 * Classify a pathname into its (module, page) using the catalogue. Falls back to
 * a bare pathname when the route is not in the catalogue (an ungoverned route).
 */
export function classifyRoute(pathname: string): RouteClass {
  const key = nodeKeyForPath(pathname);
  if (!key) {
    return { module: "", page: "", key: "" };
  }
  const chain = nodeChain(key);
  // Outermost ancestor = the module; the deepest node = the page. A module with
  // no sub-page classifies as itself.
  const moduleKey = chain[0] ?? key;
  const moduleLabel = permissionNode(moduleKey)?.label ?? "";
  const pageNode = permissionNode(key);
  const page = pageNode && key !== moduleKey ? pageNode.label : "";
  return { module: moduleLabel, page, key };
}

/** A hierarchical node for the filter dropdown, module first. */
export interface LogModuleOption {
  key: string;
  label: string;
  /** Present for modules — the pages under it. */
  children?: LogModuleOption[];
}

function toOption(n: PermissionNode): LogModuleOption {
  return {
    key: n.key,
    label: n.label,
    children:
      n.children && n.children.length > 0
        ? n.children.map(toOption)
        : undefined,
  };
}

/**
 * The module → page tree for the Logs filter, from the catalogue. Includes the
 * `admin` branch (Logs lives inside it). Excludes pure-grouping roots that own
 * no meaning for navigation filtering (`master-admin`, `platform`).
 */
export function logModuleTree(): LogModuleOption[] {
  const EXCLUDE = new Set(["master-admin", "platform"]);
  return allPermissionNodes()
    .filter((n) => n.depth === 1 && !EXCLUDE.has(n.key))
    .map((n) => {
      const opt = toOption(n);
      // A module with no pages is still selectable (it means "the whole module").
      return opt;
    });
}

/** Flatten the module tree into a map of key → label, for chip labels. */
export function logModuleLabelMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of allPermissionNodes()) map.set(n.key, n.label);
  return map;
}
