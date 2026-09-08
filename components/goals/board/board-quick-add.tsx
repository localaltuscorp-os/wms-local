"use client";

import * as React from "react";
import { Plus, Loader2, Check, Paperclip, X } from "lucide-react";
import { createGoal, addChildGoal } from "@/app/(app)/goals/cascade/actions";
import { uploadGoalAttachment } from "@/app/(app)/goals/cascade/detail-actions";
import {
  periodKeyLabel,
  periodKeyShort,
  type GoalDTO,
  type RosterMember,
} from "@/components/goals/cascade/util";
import { buildOptimisticGoal, type GoalMutationApi } from "@/components/goals/canvas/optimistic";
import type { GoalPeriod } from "@/lib/goals/types";
import { quartersOfFy, monthKeysOfFy, fyStartYearOfKey } from "@/lib/goals/types";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { DateInput } from "@/components/ui/date-input";
import { TeamWeightsField, type TeamMemberWeight } from "@/components/goals/board/team-weights-field";
import {
  ProjectTagFields,
  type ProjectOption,
  type VendorOption,
} from "@/components/goals/board/project-tag-fields";
import { GoalsBulkUpload } from "@/components/goals/board/goals-bulk-upload";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  employeeId: string;
  level: GoalPeriod;
  /** The exact bucket the new goal lands in ("2026" / "2026-Q1" / "2026-07"). */
  periodKey: string;
  /** The level-above goal OWNING this bucket (lowest Sr. No.), if any — the new
   *  goal files under it via addChildGoal; absent → a standalone via createGoal. */
  parent: { id: string; title: string } | null;
  areaOptions: string[];
  /** Measure dropdown options (→ goals.uom): base + admin-added. */
  measureOptions: string[];
  /** Type dropdown options (→ goals.category): base + admin-added. */
  typeOptions: string[];
  /** Admin-added (deletable) subsets per kind. */
  customLookups: { areas: string[]; measures: string[]; types: string[] };
  /** Admins get the inline "+ Add / delete option" affordances. */
  isAdmin: boolean;
  /** People pickable as team members (with per-member weights). */
  roster: RosterMember[];
  currentCount: number;
  mutation: GoalMutationApi;
  /** Titles already in THIS bucket — forwarded to the in-composer Bulk Upload so
   *  it can flag duplicate rows. Optional (defaults to none). */
  existingTitles?: string[];
  /** Small "+ Add" tile for a Kanban column footer (same composer drawer). */
  compact?: boolean;
  /** Projects a goal can be tagged to when "Part of Project? = Yes" (mig 0184).
   *  Optional so callers that don't pass them simply render an empty picker. */
  projects?: ProjectOption[];
  /** The vendor master — the optional "…and the vendor if relevant" tag. */
  vendors?: VendorOption[];
}

/** Imperative handle — lets the board header's "+ New goal" button fire the
 *  SAME composer (one compose path, no duplicated create flow). */
export interface BoardQuickAddHandle {
  open: () => void;
}

/**
 * The dashed "+ Add Goal" tile for the Goals level board (goal-quick-add.tsx
 * design applied to the goals table). Opens the composer drawer; the create is
 * optimistic — a temp row appears instantly and reconciles with the returned
 * server row (Sr. No., normalised money strings).
 */
export const BoardQuickAdd = React.forwardRef<BoardQuickAddHandle, Props>(
  function BoardQuickAdd(props, ref) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [area, setArea] = React.useState("");
  const [measure, setMeasure] = React.useState("");
  const [type, setType] = React.useState("Goal");
  const [target, setTarget] = React.useState("");
  const [actual, setActual] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [team, setTeam] = React.useState<TeamMemberWeight[]>([]);
  // "Part of Project?" — Yes reveals the project + (optional) vendor pickers.
  const [isProject, setIsProject] = React.useState(false);
  const [projectNodeId, setProjectNodeId] = React.useState("");
  const [vendorId, setVendorId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  // The target bucket — defaults to the board's period, but the quick-picker at
  // the top lets you retarget (Q1–Q4 / month) without leaving the composer.
  const [periodKey, setPeriodKey] = React.useState(props.periodKey);
  const [error, setError] = React.useState<string | null>(null);
  const [addedCount, setAddedCount] = React.useState(0);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setPeriodKey(props.periodKey), [props.periodKey]);

  // Sibling buckets for the top quick-picker (standalone goals only; a child goal
  // is pinned to its parent's bucket). Year has no sub-buckets.
  const periodChoices = React.useMemo<{ key: string; label: string }[]>(() => {
    if (props.parent) return [];
    const fy = fyStartYearOfKey(props.periodKey);
    if (!Number.isFinite(fy)) return [];
    if (props.level === "quarter") return quartersOfFy(fy).map((k) => ({ key: k, label: `Q${k.slice(-1)}` }));
    if (props.level === "month") return monthKeysOfFy(fy).map((k) => ({ key: k, label: periodKeyShort(k) }));
    return [];
  }, [props.parent, props.periodKey, props.level]);

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setOpen(true);
        requestAnimationFrame(() => titleRef.current?.focus());
      },
    }),
    [],
  );

  const bucketLabel = periodKeyLabel(periodKey);
  const periodNoun =
    props.level === "year"
      ? "Year"
      : props.level === "quarter"
        ? "Quarter"
        : props.level === "week"
          ? "Week"
          : "Month";

  // Spell the destination out in the header so it's unambiguous which bucket the
  // goal lands in — "Add Goal for the Month of August", "…for the Quarter Q2", …
  const composerTitle = React.useMemo(() => {
    if (props.level === "month") {
      const name = MONTHS_LONG[Number(periodKey.slice(5, 7)) - 1];
      return name ? `Add Goal for the Month of ${name}` : "Add Goal for the Month";
    }
    if (props.level === "quarter") return `Add Goal for the Quarter ${periodKey.slice(-2)}`;
    if (props.level === "year") return `Add Goal for the Year ${periodKey}`;
    return `Add Goal for the ${periodNoun}`;
  }, [props.level, periodKey, periodNoun]);
  const compact = props.compact ?? false;

  function reset() {
    setTitle("");
    setArea("");
    setMeasure("");
    setType("Goal");
    setTarget("");
    setActual("");
    setTargetDate("");
    setTeam([]);
    setIsProject(false);
    setProjectNodeId("");
    setVendorId("");
    setNotes("");
    setFiles([]);
    setPeriodKey(props.periodKey);
    setError(null);
  }

  function submit() {
    const t = title.trim();
    if (!t) {
      setError("Give the goal a name before saving.");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    setSaving(true);

    const numOrNull = (s: string): string | null => {
      const v = s.trim();
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? String(n) : null;
    };
    const fields = {
      title: t,
      area: area.trim() || null,
      uom: measure.trim() || null,
      category: type.trim() || "Goal",
      targetQty: numOrNull(target),
      actualQty: numOrNull(actual),
      teamInvolved: team.length ? team : null,
      notes: notes.trim() || null,
      // "Part of Project?" — the refs only ride along when the answer is Yes.
      isProject,
      projectNodeId: isProject ? projectNodeId || null : null,
      vendorId: isProject ? vendorId || null : null,
      // Target date rides ONLY on month goals (year/quarter roll up from children).
      targetDate: props.level === "month" ? targetDate.trim() || null : null,
    };
    const temp: GoalDTO = {
      ...buildOptimisticGoal({
        employeeId: props.employeeId,
        period: props.level,
        periodKey,
        title: t,
        area: fields.area,
      }),
      category: fields.category,
      uom: fields.uom,
      targetQty: fields.targetQty,
      actualQty: fields.actualQty,
      teamInvolved: fields.teamInvolved,
      notes: fields.notes,
      weight: 100,
      targetDate: fields.targetDate,
      parentGoalId: props.parent?.id ?? null,
    };

    // Capture the REAL created goal id (the optimistic mutate only returns ok) so
    // any picked attachments can be uploaded to it right after creation.
    let createdId: string | null = null;
    const pending = files.slice();
    void props.mutation
      .mutate({ type: "insert", row: temp }, async () => {
        const res = props.parent
          ? await addChildGoal({ parentId: props.parent.id, periodKey, ...fields })
          : await createGoal({ employeeId: props.employeeId, period: props.level, periodKey, ...fields });
        if (res.ok && "id" in res && typeof res.id === "string") createdId = res.id;
        return res;
      })
      .then(async (ok) => {
        setSaving(false);
        if (!ok) return; // mutate toasted; the temp row reverted
        // Upload attachments to the freshly-created goal (best-effort, never blocks).
        if (createdId && pending.length) {
          for (const file of pending) {
            const fd = new FormData();
            fd.set("nodeId", createdId);
            fd.set("nodeKind", "cascade");
            fd.set("file", file);
            try { await uploadGoalAttachment(fd); } catch { /* per-file best-effort */ }
          }
        }
        // Save-and-add-another: keep the composer open, clear the fields, bump the
        // running count shown in the eyebrow, and put focus back on the first field
        // so the next goal can be typed immediately. "End" closes when finished.
        setAddedCount((c) => c + 1);
        reset();
        titleRef.current?.focus();
      });
  }

  return (
    <>
      {/* The calm "+ Add Goal" tile — solid (no dashed line) with a neutral grey
          treatment: hairline border, muted grey ink + icon, soft wash on hover. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => titleRef.current?.focus());
        }}
        className={
          compact
            ? `wg-btn cursor-pointer group inline-flex w-auto shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors hover:bg-surface-soft ${FOCUS_RING}`
            : `wg-btn cursor-pointer group inline-flex w-auto items-center justify-center gap-2 self-start rounded-pill border px-4 py-2.5 text-[13.5px] font-bold transition-colors hover:bg-surface-soft ${FOCUS_RING}`
        }
        style={{ borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)", background: "var(--color-surface-soft)" }}
      >
        <span
          className={`inline-flex items-center justify-center rounded-full ${compact ? "size-5" : "size-6"}`}
          style={{ background: "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)", color: "var(--color-ink-muted)" }}
        >
          <Plus size={compact ? 13 : 15} strokeWidth={2.8} />
        </span>
        {compact ? "Add Goal" : "Add New Goal"}
        {!compact && (
          <span className="text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
            · into {bucketLabel}
          </span>
        )}
      </button>

      <WeeklyGoalDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
          setAddedCount(0);
        }}
        eyebrow={`New Goal · #${props.currentCount + addedCount + 1} · ${bucketLabel}`}
        title={composerTitle}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* Reach Bulk Upload straight from the composer — its dialog portals
                  to <body> at z-200, above this drawer (z-120), so it stacks on
                  top rather than being buried. Closing the drawer unmounts it. */}
              <GoalsBulkUpload
                employeeId={props.employeeId}
                level={props.level}
                periodKey={periodKey}
                areaOptions={props.areaOptions}
                measureOptions={props.measureOptions}
                typeOptions={props.typeOptions}
                roster={props.roster}
                existingTitles={props.existingTitles ?? []}
              />
              <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
                {addedCount > 0 ? `${addedCount} added · keep going, or End` : "⌘/Ctrl + Enter to save"}
                {props.parent ? ` · files under “${props.parent.title}”` : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                  setAddedCount(0);
                }}
                className={`inline-flex items-center whitespace-nowrap rounded-pill border px-5 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                End
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className={`pastel-cta wg-btn inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-6 py-2.5 text-[14px] font-bold disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
                Add Goal
              </button>
            </div>
          </div>
        }
      >
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        >
          {error && (
            <p
              className="mb-4 rounded-lg px-3 py-2 text-[13px] font-semibold text-altus-red"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}
            >
              {error}
            </p>
          )}

          <div className={periodChoices.length > 0 ? "flex gap-4" : ""}>
            {/* Bucket rail — retarget the goal (Q1–Q4 / all 12 months) without
                leaving the composer. Vertical + scrollable so every month is
                reachable, and sticky so it stays in view as the form scrolls.
                Standalone goals only (a child pins to its parent's bucket). */}
            {periodChoices.length > 0 && (
              <aside className="sticky top-0 z-10 shrink-0 self-start">
                <p className="mb-1.5 px-1 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">
                  Lands in
                </p>
                <div
                  className="wg-scroll flex max-h-[460px] w-[98px] flex-col gap-1 overflow-y-auto rounded-xl border p-1.5"
                  style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
                >
                  {periodChoices.map((p) => {
                    const on = p.key === periodKey;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPeriodKey(p.key)}
                        aria-pressed={on}
                        className={`wg-btn w-full rounded-lg border px-2 py-2 text-[12.5px] font-bold transition-colors cursor-pointer ${FOCUS_RING}`}
                        style={
                          on
                            ? { background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", borderColor: "var(--color-altus-red)", color: "#fff" }
                            : { background: "var(--color-surface-card)", borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }
                        }
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}

            <div className="grid min-w-0 flex-1 gap-5">
              {/* 1 · Area · Measure · Type — one row. */}
              <div className="grid gap-3 sm:grid-cols-3">
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Area</span>
              <GoalLookupSelect
                kind="area"
                noun="Area"
                value={area}
                onChange={setArea}
                options={props.areaOptions}
                custom={props.customLookups.areas}
                isAdmin={props.isAdmin}
                placeholder="Choose an area"
              />
            </div>
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Measure</span>
              <GoalLookupSelect
                kind="measure"
                noun="Measure"
                value={measure}
                onChange={setMeasure}
                options={props.measureOptions}
                custom={props.customLookups.measures}
                isAdmin={props.isAdmin}
                placeholder="Choose a measure"
              />
            </div>
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Type</span>
              <GoalLookupSelect
                kind="type"
                noun="Type"
                value={type}
                onChange={setType}
                options={props.typeOptions}
                custom={props.customLookups.types}
                isAdmin={props.isAdmin}
                placeholder="Choose a type"
              />
            </div>
          </div>

          {/* 2 · Goal — its own full-width line. */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What does done look like?"
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[15px] font-medium text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
          </label>

          {/* 2 · Actual · Target — one row. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Actual</span>
              <input
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 0"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 100"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
          </div>

          {/* ── Target Date (deadline) — MONTH goals only ── */}
          {props.level === "month" && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target Date</span>
              <DateInput
                value={targetDate}
                onChange={setTargetDate}
                ariaLabel="Target date"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-medium text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
                When should this month goal be done? Turns amber ≤7 days out, red once overdue.
              </span>
            </label>
          )}

          {/* ── Part of Project? — Yes reveals the project + vendor pickers ── */}
          <ProjectTagFields
            isProject={isProject}
            projectNodeId={projectNodeId}
            vendorId={vendorId}
            projects={props.projects ?? []}
            vendors={props.vendors ?? []}
            onChange={(next) => {
              setIsProject(next.isProject);
              setProjectNodeId(next.projectNodeId);
              setVendorId(next.vendorId);
            }}
          />

          {/* ── Team members (each with their OWN weight) ── */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Team Members</span>
            <TeamWeightsField value={team} roster={props.roster} onChange={setTeam} />
          </div>

          {/* ── Notes + Attachments — side by side ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Plan / approach…"
                className={`w-full resize-y rounded-md border bg-white px-2.5 py-2 text-[15px] font-medium text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Attachments</span>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length) setFiles((prev) => [...prev, ...picked]);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`flex w-full items-center justify-center gap-1.5 rounded-md border bg-white px-2.5 py-2.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                <Paperclip size={14} strokeWidth={2.4} /> Attach files
              </button>
              {files.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-md border px-2 py-1 text-[12px] font-medium text-ink-strong"
                      style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
                    >
                      <Paperclip size={12} className="shrink-0 text-ink-subtle" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label={`Remove ${f.name}`}
                        className="grid size-5 shrink-0 place-items-center rounded text-ink-subtle hover:text-altus-red"
                      >
                        <X size={13} strokeWidth={2.4} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
                Uploaded to the goal once you add it.
              </span>
            </div>
          </div>
            </div>
          </div>
        </div>
      </WeeklyGoalDrawer>
    </>
  );
});
