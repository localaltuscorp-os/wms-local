"use client";

import { PageCommandBar } from "@/components/layout/page-command-bar";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus,
  Check,
  X,
  Pencil,
  Archive,
  Trash2,
  MoreHorizontal,
  Diamond,
  Circle,
  ChevronRight,
  ChevronDown,
  Minus,
  FolderKanban,
  Sparkles,
  Layers,
  Target,
  ListChecks,
  GripVertical,
  CalendarDays,
  UserCircle2,
  Users,
  StickyNote,
} from "lucide-react";
import {
  createProjectNode,
  renameProjectNode,
  setProjectNodeArchived,
  deleteProjectNode,
  setProjectNodeDetails,
  setProjectNodeOwner,
  addProjectMember,
  removeProjectMember,
  reorderProjectNodes,
} from "@/app/(app)/projects/actions";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import type { ProjectTreeNode } from "@/lib/queries/projects";
import type { EmployeeOption } from "@/lib/queries/employees";

type NodeKind = "project" | "milestone" | "result" | "action" | "sub_action";

/** Roster for owner / team-member pickers, shared via context so it doesn't
 *  have to thread through the recursive tree. */
const EmployeesContext = React.createContext<EmployeeOption[]>([]);
function useEmployees() {
  return React.useContext(EmployeesContext);
}

/** Whether the signed-in user (admin or manager) may manage project structure.
 *  A plain doer (false) may ONLY add results/actions; every other editing
 *  control is hidden and the server actions reject the write too. Shared via
 *  context so it doesn't have to thread through the recursive tree. */
const CanManageContext = React.createContext<boolean>(false);
function useCanManage() {
  return React.useContext(CanManageContext);
}

const CHILD_KIND: Record<NodeKind, NodeKind | null> = {
  project: "milestone",
  milestone: "result",
  result: "action",
  action: "sub_action",
  sub_action: null,
};

const KIND_LABEL: Record<NodeKind, string> = {
  project: "Project",
  milestone: "Milestone",
  result: "Result",
  action: "Action",
  sub_action: "Sub-Action",
};

// Recursive sum of all linked tasks across the subtree. The DB only carries
// per-node counts; aggregate counts are computed in JS once on render.
function totalActions(node: ProjectTreeNode): number {
  return (
    node.actionCount +
    node.children.reduce((sum, c) => sum + totalActions(c), 0)
  );
}

function countByKind(
  node: ProjectTreeNode,
  kind: NodeKind,
): number {
  let n = node.kind === kind ? 1 : 0;
  for (const c of node.children) n += countByKind(c, kind);
  return n;
}

function pluralize(n: number, one: string, many: string = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "12 Jun 2026" — canonical Altus date. */
function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  return formatDate(d);
}

/** Date → "YYYY-MM-DD" in IST, for prefilling a <input type=date>. */
function toYmd(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
  return parts; // en-CA yields YYYY-MM-DD
}

interface Props {
  projects: ProjectTreeNode[];
  activeId: string | null;
  employees: EmployeeOption[];
  canManage: boolean;
}

/**
 * Projects workspace — a dramatic dark hero up top (mirrors the login
 * page's red-glow drama) followed by a light workspace: sticky rail of
 * projects + a focused detail card with stat strip and editorial tree.
 *
 * Selection is URL-driven (`?p=<id>`) so the active project survives a
 * refresh and is deep-linkable. The page itself stays a server component;
 * everything here is client because of inline add/rename/archive state.
 */
export function ProjectsWorkspace({ projects, activeId, employees, canManage }: Props) {
  const active = projects.find((p) => p.id === activeId) ?? null;

  // Org-wide rollups for the hero stat-strip. Cheap — these structures are
  // already in memory; cost is a few hundred function calls at most.
  const totalProjects = projects.length;
  const totalMilestones = projects.reduce(
    (sum, p) => sum + countByKind(p, "milestone"),
    0,
  );
  const totalResults = projects.reduce(
    (sum, p) => sum + countByKind(p, "result"),
    0,
  );
  const totalLinkedTasks = projects.reduce(
    (sum, p) => sum + totalActions(p),
    0,
  );

  return (
    <EmployeesContext.Provider value={employees}>
    <CanManageContext.Provider value={canManage}>
      <HeroHeader
        totals={{
          projects: totalProjects,
          milestones: totalMilestones,
          results: totalResults,
          tasks: totalLinkedTasks,
        }}
      />

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="grid grid-cols-[320px_minmax(0,1fr)] gap-12 max-lg:grid-cols-1 max-lg:gap-6 mt-10"
          style={{ opacity: 0, animation: "fadeUp 600ms ease-out 200ms forwards" }}
        >
          <ProjectRail projects={projects} activeId={active?.id ?? null} />
          {active && <ProjectDetail key={active.id} project={active} />}
        </div>
      )}
    </CanManageContext.Provider>
    </EmployeesContext.Provider>
  );
}

/* ─────────────────────────────────────────────────────── Hero header ─ */

function HeroHeader({
  totals,
}: {
  totals: { projects: number; milestones: number; results: number; tasks: number };
}) {
  return (
    /* MINIMAL HEADER (Sir) — the shared PageCommandBar, i.e. the Yearly Goals
       band. What stood here was a full-bleed near-black poster: layered radial
       gradients, a decorative dot grid, an SVG film-grain overlay and a 58px
       italic serif headline ("Break work down."), roughly 300px tall before a
       single project appeared. The counts it carried are kept — as a compact
       inline hint rather than a stat strip — and New Project moves into the
       band's actions slot. */
    <PageCommandBar
      title="Projects"
      hint={
        totals.projects > 0
          ? `${totals.projects} projects · ${totals.milestones} milestones · ${totals.results} results · ${totals.tasks} linked tasks`
          : "Project → Milestone → Result → Action. Link any task to the node it serves."
      }
      actions={<NewProjectButton />}
    />
  );
}

/* ───────────────────────────────────────────────────────────── Rail ─ */

function ProjectRail({
  projects,
  activeId,
}: {
  projects: ProjectTreeNode[];
  activeId: string | null;
}) {
  return (
    <aside className="self-start lg:sticky lg:top-6">
      <div
        className="text-ink-subtle mb-4 px-2 flex items-center gap-2"
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <Sparkles size={11} strokeWidth={2.4} className="text-ink-muted" />
        All projects
        <span className="text-ink-subtle tabular-nums ml-auto font-mono">
          {projects.length}
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {projects.map((p, i) => (
          <RailItem
            key={p.id}
            project={p}
            active={p.id === activeId}
            staggerIndex={i}
          />
        ))}
      </nav>
      <div className="mt-4 px-2">
        <NewProjectInlineLink />
      </div>
    </aside>
  );
}

function RailItem({
  project,
  active,
  staggerIndex,
}: {
  project: ProjectTreeNode;
  active: boolean;
  staggerIndex: number;
}) {
  const actions = totalActions(project);
  const milestones = project.children.length;

  // Active vs idle styles. Hover is CSS-driven (see hover: classes below)
  // so the JS-handler approach isn't needed.
  const containerStyle: React.CSSProperties = active
    ? {
        background:
          "linear-gradient(180deg, rgba(225,6,0,0.06), rgba(225,6,0,0.02))",
        border: "1px solid rgba(225, 6, 0, 0.18)",
        boxShadow:
          "0 1px 3px rgba(225, 6, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
      }
    : { border: "1px solid transparent" };

  return (
    <Link
      href={`/projects?p=${project.id}` as Route}
      scroll={false}
      replace
      className={`group relative rounded-chip transition-all ${
        active
          ? ""
          : "hover:bg-surface-card hover:!border-hairline hover:-translate-y-px hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.08)]"
      }`}
      style={{
        opacity: 0,
        animation: `fadeUp 500ms ease-out ${250 + staggerIndex * 40}ms forwards`,
        ...containerStyle,
      }}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {/* Red rail-stripe on the left edge of the active item */}
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-opacity"
          style={{
            background:
              "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))",
            opacity: active ? 1 : 0,
            boxShadow: active ? "0 0 8px rgba(225, 6, 0, 0.45)" : "none",
          }}
        />

        <span className="flex-1 min-w-0">
          <span
            className="block line-clamp-2"
            style={{
              color: active
                ? "var(--color-ink-strong)"
                : "var(--color-ink)",
              fontSize: 17,
              fontWeight: active ? 700 : 600,
              letterSpacing: "-0.005em",
              lineHeight: 1.3,
            }}
          >
            {project.name}
          </span>
          <span
            className="block tabular-nums mt-1"
            style={{
              fontSize: 13.5,
              color: "var(--color-ink-muted)",
              letterSpacing: "0.01em",
            }}
          >
            {pluralize(milestones, "milestone")} · {pluralize(actions, "task")}
          </span>
        </span>

        <ChevronRight
          size={14}
          strokeWidth={2.4}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{
            color: active
              ? "var(--color-altus-red)"
              : "var(--color-ink-subtle)",
          }}
        />
      </div>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────── Detail ─ */

function ProjectDetail({ project }: { project: ProjectTreeNode }) {
  const milestones = project.children.length;
  const results = countByKind(project, "result");
  const allActions = countByKind(project, "action") + countByKind(project, "sub_action");
  const linked = totalActions(project);

  return (
    <article
      className="relative rounded-section bg-surface-card border border-hairline overflow-hidden"
      style={{
        boxShadow:
          "0 1px 3px rgba(15, 23, 42, 0.04), 0 12px 32px -16px rgba(15, 23, 42, 0.08)",
        opacity: 0,
        animation: "fadeUp 700ms ease-out 300ms forwards",
      }}
    >
      {/* Red accent strip across the top — ties the card visually to the
          hero band above. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background:
            "linear-gradient(90deg, var(--color-altus-red) 0%, var(--color-altus-red-deep) 35%, transparent 100%)",
          opacity: 0.85,
        }}
      />

      <div className="px-12 py-11 max-md:px-6 max-md:py-7">
        {/* Card header */}
        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <div
              className="text-ink-subtle"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Project
            </div>
            <EditableTitle node={project} />
          </div>
          <NodeMenu node={project} />
        </header>

        {/* Project meta — owner, team, target date & notes, always visible. */}
        <div className="mb-9">
          <NodeDetailPanel node={project} variant="project" />
        </div>

        {/* Stat strip — KPI-style mini tiles. Cohesive with the hero. */}
        <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 mb-9">
          <StatTile
            icon={<Layers size={14} strokeWidth={2.2} />}
            label="Milestones"
            value={milestones}
            tone="amber"
          />
          <StatTile
            icon={<Target size={14} strokeWidth={2.2} />}
            label="Results"
            value={results}
            tone="blue"
          />
          <StatTile
            icon={<ChevronRight size={14} strokeWidth={2.4} />}
            label="Actions"
            value={allActions}
            tone="purple"
          />
          <StatTile
            icon={<ListChecks size={14} strokeWidth={2.2} />}
            label="Linked tasks"
            value={linked}
            tone="red"
          />
        </div>

        {/* Section eyebrow */}
        <div
          className="text-ink-subtle mb-5 flex items-center gap-2 pb-3 border-b border-hairline"
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Breakdown
          <span className="text-ink-subtle tabular-nums font-mono ml-auto" style={{ fontSize: 12 }}>
            {project.children.length === 0
              ? "Empty"
              : `${milestones} · ${results} · ${allActions}`}
          </span>
        </div>

        {/* Tree body */}
        <div>
          {project.children.length === 0 ? (
            <div
              className="text-center py-10 rounded-chip"
              style={{
                background:
                  "linear-gradient(180deg, var(--color-surface-soft) 0%, transparent 100%)",
                border: "1px dashed var(--color-hairline-strong)",
              }}
            >
              <p
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 18,
                  letterSpacing: "-0.01em",
                }}
              >
                No milestones yet.
              </p>
              <p className="text-[13px] text-ink-subtle mt-1.5">
                Add the first milestone to start breaking this project down.
              </p>
              <div className="mt-4 flex justify-center">
                <AddChildButton
                  kind="milestone"
                  parentId={project.id}
                  label="Add Milestone"
                />
              </div>
            </div>
          ) : (
            <NodeList
              nodes={project.children}
              depth={0}
              addButton={
                <AddChildButton
                  kind="milestone"
                  parentId={project.id}
                  label="Add Milestone"
                />
              }
            />
          )}
        </div>
      </div>
    </article>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "blue" | "purple" | "red";
}) {
  return (
    <div
      className="relative rounded-chip px-5 py-4 overflow-hidden border border-hairline"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--color-${tone}) 10%, var(--color-surface-card)) 0%, var(--color-surface-card) 100%)`,
      }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span
          className="inline-flex items-center justify-center size-7 rounded-md"
          style={{
            background: `color-mix(in srgb, var(--color-${tone}) 16%, transparent)`,
            color: `var(--color-${tone}-deep)`,
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: `var(--color-${tone}-deep)`,
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-ink-strong tabular-nums"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── Tree row ─ */

function KindGlyph({ kind, depth }: { kind: NodeKind; depth: number }) {
  // Milestone glyph gets the brand red (it's the headline node under the
  // project); deeper rungs use a quieting ink ramp.
  if (kind === "milestone") {
    return (
      <Diamond
        size={11}
        strokeWidth={2.2}
        fill="var(--color-altus-red)"
        style={{
          color: "var(--color-altus-red)",
          filter: "drop-shadow(0 0 6px rgba(225, 6, 0, 0.30))",
        }}
        aria-hidden
      />
    );
  }
  const inks = [
    "var(--color-ink)", //         depth 1: result
    "var(--color-ink-soft)", //    depth 2: action
    "var(--color-ink-muted)", //   depth 3: sub_action
  ];
  const color = inks[Math.min(depth - 1, inks.length - 1)] ?? inks[0];
  const sizeMap: Partial<Record<NodeKind, number>> = {
    result: 9,
    action: 11,
    sub_action: 9,
  };
  const size = sizeMap[kind] ?? 10;

  switch (kind) {
    case "result":
      return (
        <Circle
          size={size}
          strokeWidth={2.2}
          style={{ color }}
          aria-hidden
        />
      );
    case "action":
      return (
        <ChevronRight
          size={size}
          strokeWidth={2.4}
          style={{ color }}
          aria-hidden
        />
      );
    case "sub_action":
      return (
        <Minus
          size={size}
          strokeWidth={2.4}
          style={{ color }}
          aria-hidden
        />
      );
    default:
      return null;
  }
}

/** Drag handlers + visual state threaded from the parent NodeList into a row. */
interface Dnd {
  isDragging: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

/**
 * An ordered, drag-to-reorder list of sibling nodes. Reordering a node moves
 * its whole subtree with it (children stay attached), so dragging a milestone
 * down carries its results/actions — the cascade the brief asked for. Order is
 * optimistic; `reorderProjectNodes` persists the new ranks, then a refresh
 * reconciles against the server's `sortOrder`.
 */
function NodeList({
  nodes,
  depth,
  guideColor,
  addButton,
}: {
  nodes: ProjectTreeNode[];
  depth: number;
  guideColor?: string;
  addButton?: React.ReactNode;
}) {
  const router = useRouter();
  const [order, setOrder] = React.useState<string[]>(() => nodes.map((n) => n.id));
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [, start] = React.useTransition();

  // Re-sync when the server tree changes (new ref after refresh / add / delete).
  React.useEffect(() => {
    setOrder(nodes.map((n) => n.id));
  }, [nodes]);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((n): n is ProjectTreeNode => Boolean(n));

  function commit(targetId: string) {
    const dragged = dragId;
    setDragId(null);
    setOverId(null);
    if (!dragged || dragged === targetId) return;
    const next = [...order];
    const from = next.indexOf(dragged);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) return;
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    setOrder(next);
    start(async () => {
      const res = await reorderProjectNodes(next);
      if (!res.ok) {
        fireToast({ message: res.error });
        setOrder(nodes.map((n) => n.id));
      }
      router.refresh();
    });
  }

  const ulStyle: React.CSSProperties = guideColor
    ? { marginLeft: 11, paddingLeft: 17, borderLeft: `1px solid ${guideColor}` }
    : {};

  return (
    <ul className="flex flex-col gap-1.5 mt-1.5" style={ulStyle}>
      {ordered.map((node, i) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={depth}
          ordinal={i + 1}
          dnd={{
            isDragging: dragId === node.id,
            isOver: overId === node.id && dragId !== null && dragId !== node.id,
            onDragStart: () => setDragId(node.id),
            onDragEnd: () => {
              setDragId(null);
              setOverId(null);
            },
            onDragOver: () => setOverId(node.id),
            onDrop: () => commit(node.id),
          }}
        />
      ))}
      {addButton && <li className="pt-0.5">{addButton}</li>}
    </ul>
  );
}

function TreeNode({
  node,
  depth,
  ordinal,
  dnd,
}: {
  node: ProjectTreeNode;
  depth: number;
  ordinal: number;
  dnd: Dnd;
}) {
  const canManage = useCanManage();
  const childKind = CHILD_KIND[node.kind];
  const hasChildren = node.children.length > 0;
  const linked = node.actionCount;
  const [showDetails, setShowDetails] = React.useState(false);

  const typeStyles: Array<{ size: number; weight: number; color: string }> = [
    { size: 20, weight: 700, color: "var(--color-ink-strong)" }, // milestone
    { size: 18, weight: 600, color: "var(--color-ink)" }, //         result
    { size: 16.5, weight: 500, color: "var(--color-ink-soft)" }, //  action
    { size: 15, weight: 500, color: "var(--color-ink-muted)" }, //   sub-action
  ];
  const ts = typeStyles[Math.min(depth, typeStyles.length - 1)]!;

  // Guide line color: a faint red at the milestone level, hairline elsewhere.
  const guideColor =
    depth === 0
      ? "color-mix(in srgb, var(--color-altus-red) 25%, transparent)"
      : "var(--color-hairline-strong)";

  return (
    <li
      // Drag-to-reorder is manager-only; a plain doer can't reorder the tree.
      draggable={canManage}
      onDragStart={
        canManage
          ? (e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              // A drag image of the whole subtree looks messy — drag the row only.
              dnd.onDragStart();
            }
          : undefined
      }
      onDragEnd={
        canManage
          ? (e) => {
              e.stopPropagation();
              dnd.onDragEnd();
            }
          : undefined
      }
      onDragOver={
        canManage
          ? (e) => {
              // Scope to the nearest list so a child drag doesn't paint a drop
              // line on its ancestor rows too.
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              dnd.onDragOver();
            }
          : undefined
      }
      onDrop={
        canManage
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              dnd.onDrop();
            }
          : undefined
      }
      style={{
        opacity: dnd.isDragging ? 0.45 : 1,
        borderTop: dnd.isOver
          ? "2px solid var(--color-altus-red)"
          : "2px solid transparent",
        borderRadius: 6,
      }}
    >
      <NodeRow
        node={node}
        depth={depth}
        ordinal={ordinal}
        glyph={<KindGlyph kind={node.kind} depth={depth} />}
        typeStyle={ts}
        linked={linked}
        detailsOpen={showDetails}
        onToggleDetails={() => setShowDetails((v) => !v)}
      />

      {showDetails && (
        <div style={{ marginLeft: 28, marginTop: 6, marginBottom: 4 }}>
          <NodeDetailPanel node={node} />
        </div>
      )}

      {(hasChildren || childKind) && (
        <NodeList
          nodes={node.children}
          depth={depth + 1}
          guideColor={guideColor}
          addButton={
            childKind ? (
              <AddChildButton
                kind={childKind}
                parentId={node.id}
                label={`Add ${KIND_LABEL[childKind].toLowerCase()}`}
              />
            ) : undefined
          }
        />
      )}
    </li>
  );
}

function NodeRow({
  node,
  depth,
  ordinal,
  glyph,
  typeStyle,
  linked,
  detailsOpen,
  onToggleDetails,
}: {
  node: ProjectTreeNode;
  depth: number;
  ordinal: number;
  glyph: React.ReactNode;
  typeStyle: { size: number; weight: number; color: string };
  linked: number;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const canManage = useCanManage();
  return (
    <div className="group flex items-center gap-2.5 py-2 px-2.5 -mx-2.5 rounded-md transition-colors hover:bg-surface-soft">
      {/* Drag handle — appears on hover, cursor signals grab. Manager-only;
          hidden for plain doers since they can't reorder. */}
      {canManage && (
        <span
          aria-hidden
          className="shrink-0 cursor-grab opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
          title="Drag to reorder"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <GripVertical size={14} strokeWidth={2} />
        </span>
      )}

      {/* Ordinal — the hierarchy number the brief asked for. */}
      <span
        className="shrink-0 tabular-nums text-right"
        style={{
          width: 22,
          fontSize: 14,
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          color: "var(--color-ink-muted)",
        }}
      >
        {ordinal}
      </span>

      <span
        aria-hidden
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: 14, height: 16 }}
      >
        {glyph}
      </span>

      <EditableName node={node} typeStyle={typeStyle} depth={depth} />

      {/* Assign-owner pill — interactive and always shown on every row, so any
          node (milestone, action, sub-action, …) can be assigned to a person
          directly without opening the details panel. */}
      <span className="shrink-0">
        <OwnerPicker node={node} compact />
      </span>
      {node.targetDate && (
        <span
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill tabular-nums max-md:hidden"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-amber-deep)",
            background: "color-mix(in srgb, var(--color-amber) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)",
          }}
          title="Target date"
        >
          <CalendarDays size={13} strokeWidth={2.2} />
          {fmtDate(node.targetDate)}
        </span>
      )}

      {linked > 0 && (
        <Link
          href={`/projects/${node.id}` as Route}
          className="shrink-0 tabular-nums px-3 py-1 rounded-pill transition-colors hover:brightness-110"
          style={{
            fontSize: 13.5,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "var(--color-altus-red-deep)",
            background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 26%, transparent)",
          }}
          title="View linked tasks"
        >
          {linked} {linked === 1 ? "task" : "tasks"}
        </Link>
      )}

      {/* Details toggle — team / target date / notes editor. Always visible
          and big enough to spot, so the extra controls are discoverable on
          every node. */}
      <button
        type="button"
        onClick={onToggleDetails}
        aria-label={detailsOpen ? "Hide details" : "Edit team, target date & notes"}
        aria-expanded={detailsOpen}
        className="shrink-0 inline-flex items-center justify-center size-8 rounded-lg border transition-all hover:border-altus-red"
        style={{
          borderColor: detailsOpen
            ? "var(--color-altus-red)"
            : "var(--color-hairline-strong)",
          color: detailsOpen ? "var(--color-altus-red)" : "var(--color-ink-soft)",
          background: "var(--color-surface-card)",
        }}
        title="Team, target date & notes"
      >
        {detailsOpen ? (
          <ChevronDown size={16} strokeWidth={2.4} />
        ) : (
          <Pencil size={15} strokeWidth={2.2} />
        )}
      </button>

      <NodeMenu node={node} compact />
    </div>
  );
}

/* ─────────────────────────────────────────────────────── Editable name ─ */

function EditableTitle({ node }: { node: ProjectTreeNode }) {
  return (
    <EditableName
      node={node}
      typeStyle={{
        size: 44,
        weight: 500,
        color: "var(--color-ink-strong)",
      }}
      depth={-1}
      asHeading
    />
  );
}

function EditableName({
  node,
  typeStyle,
  depth: _depth,
  asHeading = false,
}: {
  node: ProjectTreeNode;
  typeStyle: { size: number; weight: number; color: string };
  depth: number;
  asHeading?: boolean;
}) {
  const canManage = useCanManage();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(node.name);
  const [pending, start] = React.useTransition();

  React.useEffect(() => setName(node.name), [node.name]);

  function save() {
    const v = name.trim();
    if (!v || v === node.name) {
      setEditing(false);
      setName(node.name);
      return;
    }
    start(async () => {
      const res = await renameProjectNode(node.id, v);
      if (!res.ok) {
        fireToast({ message: res.error });
        setName(node.name);
      }
      setEditing(false);
      router.refresh();
    });
  }

  const sharedStyle: React.CSSProperties = {
    fontFamily: asHeading ? "var(--font-serif)" : "var(--font-sans)",
    fontStyle: asHeading ? "italic" : "normal",
    fontSize: typeStyle.size,
    fontWeight: typeStyle.weight,
    color: typeStyle.color,
    letterSpacing: asHeading ? "-0.025em" : "-0.005em",
    lineHeight: asHeading ? 1.05 : 1.35,
  };

  // Plain doer: non-editable plain text (no double-click-to-rename).
  if (!canManage) {
    return (
      <span className="flex-1 min-w-0 break-words" style={sharedStyle}>
        {node.name}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setEditing(false);
            setName(node.name);
          }
        }}
        onBlur={save}
        disabled={pending}
        maxLength={160}
        className="flex-1 min-w-0 bg-transparent outline-none border-b border-hairline-strong focus:border-altus-red"
        style={sharedStyle}
      />
    );
  }

  return (
    <button
      type="button"
      data-node-name={node.id}
      onDoubleClick={() => setEditing(true)}
      className="flex-1 min-w-0 text-left cursor-text break-words"
      style={sharedStyle}
      title="Double-click to rename"
    >
      {node.name}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── Node menu ─ */

function NodeMenu({
  node,
  compact = false,
}: {
  node: ProjectTreeNode;
  compact?: boolean;
}) {
  const canManage = useCanManage();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  function rename() {
    setOpen(false);
    const target = document.querySelector<HTMLButtonElement>(
      `[data-node-name="${node.id}"]`,
    );
    target?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    );
  }

  function archive() {
    setOpen(false);
    start(async () => {
      const res = await setProjectNodeArchived(node.id, true);
      if (!res.ok) {
        fireToast({ message: res.error });
      } else {
        fireToast({ message: `${node.name} archived.` });
      }
      router.refresh();
    });
  }

  function performDelete() {
    start(async () => {
      const res = await deleteProjectNode(node.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: `${node.name} deleted.` });
      setConfirmOpen(false);
      router.refresh();
    });
  }

  // Plain doer: no rename/archive/delete menu at all.
  if (!canManage) return null;

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${node.name}`}
            disabled={pending}
            className={`shrink-0 inline-flex items-center justify-center rounded-md transition-all ${
              compact
                ? "size-6 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white"
                : "size-8 opacity-60 hover:opacity-100 hover:bg-surface-soft"
            }`}
            style={{ color: "var(--color-ink-subtle)" }}
          >
            <MoreHorizontal size={compact ? 14 : 16} strokeWidth={2.2} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[160px] rounded-chip border bg-surface-card py-1"
            style={{
              borderColor: "var(--color-hairline-strong)",
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
            }}
          >
            <MenuItem onClick={rename} icon={<Pencil size={13} strokeWidth={2.2} />}>
              Rename
            </MenuItem>
            <MenuItem
              onClick={archive}
              icon={<Archive size={13} strokeWidth={2.2} />}
            >
              Archive
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              icon={<Trash2 size={13} strokeWidth={2.2} />}
              danger
            >
              Delete
            </MenuItem>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <DeleteNodeDialog
        node={node}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={pending}
        onConfirm={performDelete}
      />
    </>
  );
}

/**
 * Two-step delete confirmation (#13.2). Step 1 spells out what's about to be
 * removed; step 2 makes the user type the node's name before the destructive
 * button enables — so a project (and its whole subtree) can't be deleted by a
 * single stray click. Linked tasks are unlinked, never deleted.
 */
function DeleteNodeDialog({
  node,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  node: ProjectTreeNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [typed, setTyped] = React.useState("");

  // Reset to a clean step-1 state whenever the dialog (re)opens/closes.
  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setTyped("");
    }
  }, [open]);

  const kindLabel = KIND_LABEL[node.kind].toLowerCase();
  const scope =
    node.kind === "project"
      ? "every milestone, result and action inside it"
      : node.kind === "sub_action"
        ? null
        : "its sub-items";
  const descendants = node.children.length;
  const confirmable = typed.trim() === node.name.trim();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6 max-h-[calc(100dvh-32px)] overflow-y-auto"
          style={{
            border: "1px solid var(--color-hairline-strong)",
            boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span
              aria-hidden
              className="inline-flex shrink-0 items-center justify-center size-10 rounded-xl"
              style={{
                background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                color: "var(--color-altus-red)",
              }}
            >
              <Trash2 size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 22,
                  letterSpacing: "-0.01em",
                }}
              >
                Delete {kindLabel}?
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-ink-subtle mt-1" style={{ lineHeight: 1.5 }}>
                {step === 1
                  ? "Step 1 of 2 — review what will be removed."
                  : "Step 2 of 2 — confirm to finish."}
              </Dialog.Description>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div
                className="rounded-chip p-4 mb-4"
                style={{
                  background: "var(--color-surface-soft)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <p className="text-[15px] text-ink-strong font-semibold break-words">
                  “{node.name}”
                </p>
                <ul className="mt-2 space-y-1 text-[13.5px] text-ink-soft" style={{ lineHeight: 1.5 }}>
                  {scope && (
                    <li>
                      • Deletes {scope}
                      {descendants > 0 ? ` (${descendants} direct child${descendants === 1 ? "" : "ren"})` : ""}.
                    </li>
                  )}
                  <li>• Linked tasks are <strong>kept</strong> — just unlinked from this project.</li>
                  <li>• This <strong>cannot be undone</strong>. Prefer Archive if unsure.</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="bg-surface-card px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-soft mb-2" style={{ lineHeight: 1.55 }}>
                Type the {kindLabel} name{" "}
                <span className="font-bold text-ink-strong">{node.name}</span> to
                confirm deletion.
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmable && !pending) onConfirm();
                }}
                placeholder={node.name}
                className="w-full rounded-md border px-3.5 py-2.5 text-[15px] outline-none focus:border-altus-red mb-4"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={pending}
                  className="bg-surface-card px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!confirmable || pending}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-px"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                  }}
                >
                  {pending ? "Deleting…" : `Permanently Delete`}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MenuItem({
  onClick,
  icon,
  children,
  danger = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[14.5px] transition-colors hover:bg-surface-soft"
      style={{ color: danger ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)" }}
    >
      <span
        className="shrink-0"
        style={{ color: danger ? "var(--color-altus-red)" : "var(--color-ink-muted)" }}
      >
        {icon}
      </span>
      <span>{children}</span>
    </button>
  );
}

/* ─────────────────────────────────────────────────── Node detail panel ─ */

/**
 * Owner, team members, target date and notes for a node. Rendered always-on
 * for the project header (`variant="project"`) and on-demand under any tree
 * row. Each control saves independently and refreshes; owners/members trigger
 * server-side notifications so assignees "get to know" they've been given work.
 */
function NodeDetailPanel({
  node,
  variant = "node",
}: {
  node: ProjectTreeNode;
  variant?: "project" | "node";
}) {
  const isProject = variant === "project";
  return (
    <div
      className="rounded-chip p-4 max-md:p-3"
      style={{
        background: isProject
          ? "linear-gradient(180deg, var(--color-surface-soft) 0%, transparent 100%)"
          : "var(--color-surface-soft)",
        border: "1px solid var(--color-hairline)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Project header keeps its Owner picker here; tree rows show the owner
            pill inline on the row itself, so it'd be redundant in this panel. */}
        {isProject && <OwnerPicker node={node} />}
        <MembersPicker node={node} />
        <TargetDateEditor node={node} />
      </div>
      <NotesEditor node={node} big={isProject} />
    </div>
  );
}

function FieldLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0"
      style={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--color-ink-subtle)",
      }}
    >
      <span style={{ color: "var(--color-ink-muted)" }}>{icon}</span>
      {children}
    </span>
  );
}

function OwnerPicker({
  node,
  compact = false,
}: {
  node: ProjectTreeNode;
  compact?: boolean;
}) {
  const canManage = useCanManage();
  const employees = useEmployees();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [pending, start] = React.useTransition();

  // Plain doer: static, read-only owner display — no people dropdown.
  if (!canManage) {
    return (
      <div className="flex items-center gap-2">
        {!compact && (
          <FieldLabel icon={<UserCircle2 size={12} strokeWidth={2.2} />}>
            Owner
          </FieldLabel>
        )}
        <span
          className="inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-[15px] font-semibold"
          title={node.ownerName ? `Owner: ${node.ownerName}` : "No owner"}
          style={{
            borderColor: node.ownerName
              ? "color-mix(in srgb, var(--color-altus-red) 35%, transparent)"
              : "var(--color-hairline-strong)",
            background: node.ownerName
              ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)"
              : "var(--color-surface-card)",
            color: node.ownerName
              ? "var(--color-ink-strong)"
              : "var(--color-ink-muted)",
          }}
        >
          <UserCircle2
            size={15}
            strokeWidth={2.2}
            className="shrink-0"
            style={{
              color: node.ownerName
                ? "var(--color-altus-red)"
                : "var(--color-ink-subtle)",
            }}
          />
          {node.ownerName
            ? compact
              ? node.ownerName.split(" ")[0]
              : node.ownerName
            : compact
              ? "—"
              : "No owner"}
        </span>
      </div>
    );
  }

  function choose(ownerId: string | null) {
    setOpen(false);
    setQuery("");
    if (ownerId === node.ownerId) return;
    start(async () => {
      const res = await setProjectNodeOwner(node.id, ownerId);
      if (!res.ok) fireToast({ message: res.error });
      router.refresh();
    });
  }

  const matches = query.trim()
    ? employees.filter((e) =>
        e.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : employees;

  return (
    <div className="flex items-center gap-2">
      {!compact && (
        <FieldLabel icon={<UserCircle2 size={12} strokeWidth={2.2} />}>
          Owner
        </FieldLabel>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={pending}
            title={node.ownerName ? `Owner: ${node.ownerName}` : "Assign an owner"}
            className="inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-[15px] font-semibold transition-colors hover:border-altus-red disabled:opacity-50"
            style={{
              borderColor: node.ownerName
                ? "color-mix(in srgb, var(--color-altus-red) 35%, transparent)"
                : "var(--color-hairline-strong)",
              background: node.ownerName
                ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)"
                : "var(--color-surface-card)",
              color: node.ownerName
                ? "var(--color-ink-strong)"
                : "var(--color-ink-muted)",
            }}
          >
            <UserCircle2
              size={15}
              strokeWidth={2.2}
              className="shrink-0"
              style={{
                color: node.ownerName
                  ? "var(--color-altus-red)"
                  : "var(--color-ink-subtle)",
              }}
            />
            {compact && node.ownerName
              ? node.ownerName.split(" ")[0]
              : (node.ownerName ?? "Assign owner")}
            <ChevronDown size={13} strokeWidth={2.4} className="text-ink-subtle" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[240px] rounded-chip border bg-surface-card p-1.5"
            style={{
              borderColor: "var(--color-hairline-strong)",
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
            }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="w-full rounded-md border border-hairline px-2.5 py-1.5 text-[14.5px] outline-none focus:border-altus-red mb-1"
            />
            <div className="max-h-[240px] overflow-y-auto">
              <PickerRow
                label="No owner"
                muted
                selected={!node.ownerId}
                onClick={() => choose(null)}
              />
              {matches.map((e) => (
                <PickerRow
                  key={e.id}
                  label={e.name}
                  selected={e.id === node.ownerId}
                  onClick={() => choose(e.id)}
                />
              ))}
              {matches.length === 0 && (
                <p className="px-2.5 py-2 text-[12.5px] text-ink-muted">
                  No matches.
                </p>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function MembersPicker({ node }: { node: ProjectTreeNode }) {
  const canManage = useCanManage();
  const employees = useEmployees();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [pending, start] = React.useTransition();
  const memberIds = new Set(node.members.map((m) => m.id));

  // Plain doer: static member chips — no remove "x", no Add picker.
  if (!canManage) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <FieldLabel icon={<Users size={12} strokeWidth={2.2} />}>Team</FieldLabel>
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {node.members.length === 0 ? (
            <span className="text-[13.5px] text-ink-muted">—</span>
          ) : (
            node.members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[13.5px] font-semibold"
                style={{
                  background: "color-mix(in srgb, var(--color-blue) 12%, transparent)",
                  color: "var(--color-blue-deep)",
                  border: "1px solid color-mix(in srgb, var(--color-blue) 28%, transparent)",
                }}
              >
                {m.name ?? "—"}
              </span>
            ))
          )}
        </div>
      </div>
    );
  }

  function toggle(employeeId: string) {
    start(async () => {
      const res = memberIds.has(employeeId)
        ? await removeProjectMember(node.id, employeeId)
        : await addProjectMember(node.id, employeeId);
      if (!res.ok) fireToast({ message: res.error });
      router.refresh();
    });
  }

  const matches = query.trim()
    ? employees.filter((e) =>
        e.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : employees;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <FieldLabel icon={<Users size={12} strokeWidth={2.2} />}>Team</FieldLabel>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        {node.members.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[13.5px] font-semibold"
            style={{
              background: "color-mix(in srgb, var(--color-blue) 12%, transparent)",
              color: "var(--color-blue-deep)",
              border: "1px solid color-mix(in srgb, var(--color-blue) 28%, transparent)",
            }}
          >
            {m.name ?? "—"}
            <button
              type="button"
              onClick={() => toggle(m.id)}
              disabled={pending}
              aria-label={`Remove ${m.name ?? "member"}`}
              className="hover:text-altus-red disabled:opacity-50"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          </span>
        ))}
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-pill border border-solid px-2.5 py-1 text-[13.5px] font-semibold text-ink-muted hover:text-altus-red hover:border-altus-red transition-colors disabled:opacity-50"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              <Plus size={13} strokeWidth={2.6} />
              Add
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              className="z-50 w-[240px] rounded-chip border bg-surface-card p-1.5"
              style={{
                borderColor: "var(--color-hairline-strong)",
                boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
              }}
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="w-full rounded-md border border-hairline px-2.5 py-1.5 text-[14.5px] outline-none focus:border-altus-red mb-1"
              />
              <div className="max-h-[240px] overflow-y-auto">
                {matches.map((e) => (
                  <PickerRow
                    key={e.id}
                    label={e.name}
                    selected={memberIds.has(e.id)}
                    onClick={() => toggle(e.id)}
                    keepOpen
                  />
                ))}
                {matches.length === 0 && (
                  <p className="px-2.5 py-2 text-[12.5px] text-ink-muted">
                    No matches.
                  </p>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}

function PickerRow({
  label,
  selected,
  onClick,
  muted = false,
  keepOpen = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  muted?: boolean;
  keepOpen?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        if (keepOpen) e.preventDefault();
        onClick();
      }}
      className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14.5px] text-left transition-colors hover:bg-surface-soft"
      style={{ color: muted ? "var(--color-ink-muted)" : "var(--color-ink-strong)" }}
    >
      <span
        className="inline-flex items-center justify-center shrink-0 size-4 rounded"
        style={{
          border: selected
            ? "none"
            : "1.5px solid var(--color-hairline-strong)",
          background: selected ? "var(--color-altus-red)" : "transparent",
          color: "#fff",
        }}
      >
        {selected && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function TargetDateEditor({ node }: { node: ProjectTreeNode }) {
  const canManage = useCanManage();
  const router = useRouter();
  const [pending, start] = React.useTransition();

  // Plain doer: static target-date text — no input, no clear button.
  if (!canManage) {
    return (
      <div className="flex items-center gap-2">
        <FieldLabel icon={<CalendarDays size={12} strokeWidth={2.2} />}>
          Target
        </FieldLabel>
        <span
          className="text-[14.5px] tabular-nums"
          style={{
            color: node.targetDate
              ? "var(--color-ink-strong)"
              : "var(--color-ink-muted)",
          }}
        >
          {node.targetDate ? fmtDate(node.targetDate) : "—"}
        </span>
      </div>
    );
  }

  function save(ymd: string | null) {
    start(async () => {
      const res = await setProjectNodeDetails(node.id, { targetDate: ymd });
      if (!res.ok) fireToast({ message: res.error });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <FieldLabel icon={<CalendarDays size={12} strokeWidth={2.2} />}>
        Target
      </FieldLabel>
      <div className="relative inline-flex items-center">
        <input
          type="date"
          defaultValue={toYmd(node.targetDate)}
          disabled={pending}
          onChange={(e) => save(e.target.value || null)}
          className="rounded-md border px-3 py-1.5 text-[14.5px] outline-none focus:border-altus-red disabled:opacity-50 tabular-nums"
          style={{
            borderColor: "var(--color-hairline-strong)",
            background: "var(--color-surface-card)",
            color: "var(--color-ink-strong)",
          }}
        />
        {node.targetDate && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={pending}
            aria-label="Clear target date"
            className="ml-1 text-ink-muted hover:text-altus-red disabled:opacity-50"
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}

function NotesEditor({ node, big }: { node: ProjectTreeNode; big: boolean }) {
  const canManage = useCanManage();
  const router = useRouter();
  const [value, setValue] = React.useState(node.notes ?? "");
  const [pending, start] = React.useTransition();
  const dirty = value.trim() !== (node.notes ?? "").trim();

  React.useEffect(() => setValue(node.notes ?? ""), [node.notes]);

  // Plain doer: read-only notes — no textarea, no Save.
  if (!canManage) {
    return (
      <div className="mt-3">
        <FieldLabel icon={<StickyNote size={12} strokeWidth={2.2} />}>
          Notes
        </FieldLabel>
        <p
          className="mt-1.5 whitespace-pre-wrap"
          style={{
            fontSize: big ? 17 : 15.5,
            lineHeight: 1.6,
            color: node.notes
              ? "var(--color-ink-strong)"
              : "var(--color-ink-muted)",
          }}
        >
          {node.notes ? node.notes : "No notes."}
        </p>
      </div>
    );
  }

  function save() {
    if (!dirty) return;
    start(async () => {
      const res = await setProjectNodeDetails(node.id, {
        notes: value.trim() ? value.trim() : null,
      });
      if (!res.ok) fireToast({ message: res.error });
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <FieldLabel icon={<StickyNote size={12} strokeWidth={2.2} />}>
          Notes
        </FieldLabel>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13.5px] font-bold text-white disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            }}
          >
            <Check size={13} strokeWidth={3} />
            Save Notes
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder="Context, intent, acceptance criteria… written here so whoever picks this up knows what's expected."
        rows={big ? 4 : 3}
        maxLength={8000}
        className="w-full resize-y rounded-md border bg-surface-card px-3 py-2.5 outline-none focus:border-altus-red"
        style={{
          borderColor: "var(--color-hairline-strong)",
          fontSize: big ? 17 : 15.5,
          lineHeight: 1.6,
          color: "var(--color-ink-strong)",
        }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────── Add nodes ─ */

function AddChildButton({
  kind,
  parentId,
  label,
}: {
  kind: NodeKind;
  parentId: string | null;
  label: string;
}) {
  const canManage = useCanManage();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();

  // A plain doer may only ADD a result or an action; the milestone/sub-action/
  // project add-buttons are hidden for them (the server rejects them too).
  if (!canManage && kind !== "result" && kind !== "action") return null;

  function add() {
    const v = name.trim();
    if (!v) return;
    start(async () => {
      const res = await createProjectNode({ name: v, kind, parentId });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      setName("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-[15px] font-semibold text-ink-soft hover:text-altus-red hover:border-altus-red transition-colors"
        style={{
          borderColor: "var(--color-hairline-strong)",
          background: "var(--color-surface-card)",
        }}
      >
        <Plus size={15} strokeWidth={2.4} />
        {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 py-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder={`${KIND_LABEL[kind]} name`}
        maxLength={160}
        disabled={pending}
        className="rounded-md border border-hairline-strong px-2.5 py-1.5 text-[14.5px] outline-none focus:border-altus-red"
        style={{ minWidth: 240 }}
      />
      <button
        type="button"
        onClick={add}
        disabled={pending || !name.trim()}
        aria-label="Save"
        className="p-1.5 rounded-md border border-hairline bg-white hover:bg-surface-soft disabled:opacity-40"
      >
        <Check size={14} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        aria-label="Cancel"
        className="p-1.5 rounded-md border border-hairline bg-white hover:bg-surface-soft text-ink-muted"
      >
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function NewProjectButton({ hero = false }: { hero?: boolean }) {
  const canManage = useCanManage();
  if (!canManage) return null;
  return (
    <NewProjectControl
      hero={hero}
      trigger={(openFn) => {
        if (hero) {
          return (
            <button
              type="button"
              onClick={openFn}
              className="group relative inline-flex items-center gap-2 px-5 py-3 rounded-pill text-white font-bold text-[13.5px] transition-all hover:-translate-y-px shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow:
                  "0 8px 24px -8px rgba(225, 6, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                letterSpacing: "0.01em",
              }}
            >
              <Plus size={15} strokeWidth={2.6} />
              New Project
              <span
                aria-hidden
                className="absolute inset-0 rounded-pill pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  boxShadow: "0 0 24px 0 rgba(225, 6, 0, 0.45)",
                }}
              />
            </button>
          );
        }
        return (
          <button
            type="button"
            onClick={openFn}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3.5 py-2 text-[13px] font-semibold text-ink-strong hover:border-altus-red transition-colors"
          >
            <Plus size={14} strokeWidth={2.4} />
            New Project
          </button>
        );
      }}
    />
  );
}

function NewProjectInlineLink() {
  const canManage = useCanManage();
  if (!canManage) return null;
  return (
    <NewProjectControl
      trigger={(openFn) => (
        <button
          type="button"
          onClick={openFn}
          className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink-muted hover:text-altus-red transition-colors py-1"
        >
          <Plus size={12} strokeWidth={2.4} />
          New Project
        </button>
      )}
    />
  );
}

function NewProjectControl({
  trigger,
  hero: _hero = false,
}: {
  trigger: (open: () => void) => React.ReactNode;
  hero?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();

  function add() {
    const v = name.trim();
    if (!v) return;
    start(async () => {
      const res = await createProjectNode({
        name: v,
        kind: "project",
        parentId: null,
      });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      const newId = res.id;
      setName("");
      setOpen(false);
      router.push(`/projects?p=${newId}` as Route);
      router.refresh();
    });
  }

  if (!open) {
    return <>{trigger(() => setOpen(true))}</>;
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded-pill p-1.5"
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder="Project name"
        maxLength={160}
        disabled={pending}
        className="bg-transparent px-2.5 py-1 text-[13.5px] outline-none flex-1"
        style={{ minWidth: 220 }}
      />
      <button
        type="button"
        onClick={add}
        disabled={pending || !name.trim()}
        aria-label="Save"
        className="size-7 inline-flex items-center justify-center rounded-full bg-altus-red text-white hover:opacity-90 disabled:opacity-40"
        style={{
          background:
            "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
        }}
      >
        <Check size={14} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        aria-label="Cancel"
        className="size-7 inline-flex items-center justify-center rounded-full hover:bg-surface-soft text-ink-muted"
      >
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/* ───────────────────────────────────────────────────── Empty state ─ */

function EmptyState() {
  return (
    <div
      className="rounded-section bg-surface-card border border-hairline px-12 py-20 text-center max-w-[680px] mx-auto mt-10 relative overflow-hidden"
      style={{
        boxShadow:
          "0 1px 3px rgba(15, 23, 42, 0.04), 0 16px 40px -16px rgba(15, 23, 42, 0.08)",
        opacity: 0,
        animation: "fadeUp 700ms ease-out 200ms forwards",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background:
            "linear-gradient(90deg, var(--color-altus-red) 0%, var(--color-altus-red-deep) 35%, transparent 100%)",
        }}
      />
      <div
        className="inline-flex items-center justify-center size-14 rounded-2xl mb-5"
        style={{
          background:
            "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(225, 6, 0, 0.10), transparent 70%)",
          border: "1px solid color-mix(in srgb, var(--color-altus-red) 18%, transparent)",
        }}
      >
        <FolderKanban
          size={24}
          strokeWidth={1.8}
          style={{ color: "var(--color-altus-red)" }}
        />
      </div>
      <p
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 32,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        Build a project tree.
      </p>
      <p className="text-[14px] text-ink-subtle mt-3 max-w-sm mx-auto leading-relaxed">
        A project is the rough shape of an outcome. Break it down into
        milestones, results, and concrete actions — then link tasks to any
        node from the task's form.
      </p>
      <div className="mt-7 flex justify-center">
        <NewProjectButton hero />
      </div>
    </div>
  );
}
