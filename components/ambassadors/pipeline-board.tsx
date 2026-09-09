"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  Plus,
  LayoutGrid,
  Table2,
  GripVertical,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { fireToast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import { setReferralStage } from "@/app/(app)/ambassadors/actions";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  STAGE_TONES,
  STAGES,
  type Stage,
  type StageTone,
} from "@/lib/ambassadors/stages";
import { inr, inrCompact } from "@/lib/ambassadors/format";
import type { ReferralRow } from "@/lib/queries/ambassadors";
import { ReferralDrawer } from "./referral-drawer";

interface Props {
  referrals: ReferralRow[];
  ambassadors: { id: string; name: string }[];
  products: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}

/** Columns = the linear pipeline plus a terminal Lost column. */
const COLUMNS: Stage[] = [...PIPELINE_STAGES, "lost"];

/**
 * Each tone resolves to a brand CSS variable trio: a base accent, a deep accent
 * (text/headers), and a soft tint for column/card washes. Brand tokens only.
 */
function toneVars(tone: StageTone): { accent: string; deep: string; tint: string } {
  switch (tone) {
    case "neutral":
      return { accent: "var(--color-ink-soft)", deep: "var(--color-ink-strong)", tint: "var(--color-surface-soft)" };
    case "progress":
      return {
        accent: "var(--color-altus-red)",
        deep: "var(--color-altus-red-deep)",
        tint: "color-mix(in srgb, var(--color-altus-red) 6%, white)",
      };
    case "warm":
      return {
        accent: "var(--color-amber)",
        deep: "var(--color-amber-deep)",
        tint: "color-mix(in srgb, var(--color-amber) 9%, white)",
      };
    case "win":
      return {
        accent: "var(--color-green)",
        deep: "var(--color-green-deep)",
        tint: "color-mix(in srgb, var(--color-green) 9%, white)",
      };
    case "money":
      return {
        accent: "var(--color-green-deep)",
        deep: "var(--color-green-deep)",
        tint: "color-mix(in srgb, var(--color-green) 12%, white)",
      };
    case "lost":
      return {
        accent: "color-mix(in srgb, var(--color-altus-red-deep) 55%, var(--color-ink-soft))",
        deep: "var(--color-altus-red-deep)",
        tint: "var(--color-surface-soft)",
      };
  }
}

const SEG_BTN =
  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] font-bold transition-colors";

export function PipelineBoard({ referrals, ambassadors, products, employees }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(referrals);
  const [view, setView] = React.useState<"board" | "table">("board");
  const [savingId, setSavingId] = React.useState<string | null>(null);

  // Filters
  const [fAmb, setFAmb] = React.useState<string>("");
  const [fOwner, setFOwner] = React.useState<string>("");
  const [fStage, setFStage] = React.useState<string>("");

  // Drawer
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ReferralRow | undefined>(undefined);

  // Drag
  const [active, setActive] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);

  React.useEffect(() => setItems(referrals), [referrals]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const owners = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of items) if (r.assignedToId && r.assignedToName) seen.set(r.assignedToId, r.assignedToName);
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = React.useMemo(
    () =>
      items.filter(
        (r) =>
          (!fAmb || r.ambassadorId === fAmb) &&
          (!fOwner || r.assignedToId === fOwner) &&
          (!fStage || r.stage === fStage),
      ),
    [items, fAmb, fOwner, fStage],
  );

  async function changeStage(referralId: string, stage: Stage) {
    const ref = items.find((r) => r.id === referralId);
    if (!ref || ref.stage === stage) return;
    const prev = items;
    setItems((cur) => cur.map((r) => (r.id === referralId ? { ...r, stage } : r)));
    setSavingId(referralId);
    const res = await setReferralStage(referralId, stage);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev); // revert the optimistic move
      fireToast({ message: res.error || "Couldn't change the stage.", type: "error" });
      return;
    }
    fireToast({ message: `Moved to ${STAGE_LABELS[stage]}.`, type: "success" });
    router.refresh();
  }

  function onDragStart(e: DragStartEvent) {
    setActive(String(e.active.id));
  }
  function onDragOver(e: DragOverEvent) {
    setOverCol(e.over ? String(e.over.id) : null);
  }
  function onDragEnd(e: DragEndEvent) {
    const id = active;
    setActive(null);
    setOverCol(null);
    if (!id || !e.over) return;
    void changeStage(id, String(e.over.id) as Stage);
  }

  function openNew() {
    setEditing(undefined);
    setDrawerOpen(true);
  }

  const activeCard = active ? items.find((r) => r.id === active) ?? null : null;
  const hasFilter = !!(fAmb || fOwner || fStage);

  return (
    <div>
      {/* Top bar: filters + view toggle + new */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterSelect label="Ambassador" value={fAmb} onChange={setFAmb} options={ambassadors} />
        <FilterSelect label="Owner" value={fOwner} onChange={setFOwner} options={owners} />
        <FilterSelect
          label="Stage"
          value={fStage}
          onChange={setFStage}
          options={STAGES.map((s) => ({ id: s, name: STAGE_LABELS[s] }))}
        />
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setFAmb("");
              setFOwner("");
              setFStage("");
            }}
            className="bg-surface-card text-[13px] font-bold text-ink-muted underline-offset-2 hover:text-altus-red hover:underline"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-[13.5px] font-semibold text-ink-soft">
          <span className="font-bold tabular-nums text-ink-strong">{filtered.length}</span>{" "}
          {filtered.length === 1 ? "referral" : "referrals"}
        </span>

        {/* Segmented view control */}
        <div
          className="inline-flex items-center gap-1 rounded-xl p-1"
          style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
          role="tablist"
          aria-label="Pipeline view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "board"}
            onClick={() => setView("board")}
            className={SEG_BTN}
            style={
              view === "board"
                ? { background: "white", color: "var(--color-ink-strong)", boxShadow: "0 1px 2px rgba(15,23,42,0.10)" }
                : { color: "var(--color-ink-muted)" }
            }
          >
            <LayoutGrid size={15} strokeWidth={2.5} />
            Board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "table"}
            onClick={() => setView("table")}
            className={SEG_BTN}
            style={
              view === "table"
                ? { background: "white", color: "var(--color-ink-strong)", boxShadow: "0 1px 2px rgba(15,23,42,0.10)" }
                : { color: "var(--color-ink-muted)" }
            }
          >
            <Table2 size={15} strokeWidth={2.5} />
            Table
          </button>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)",
          }}
        >
          <Plus size={17} strokeWidth={2.6} />
          New Referral
        </button>
      </div>

      {view === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActive(null);
            setOverCol(null);
          }}
        >
          <div
            className="kanban-scroll flex items-stretch gap-4 overflow-x-auto overflow-y-auto pb-3 max-sm:snap-x max-sm:snap-mandatory"
            style={{ maxHeight: "calc(100dvh - 300px)", minHeight: 460 }}
          >
            {COLUMNS.map((stage) => {
              const colItems = filtered.filter((r) => r.stage === stage);
              const total = colItems.reduce((a, r) => a + (r.dealAmount ?? 0), 0);
              return (
                <PipelineColumn
                  key={stage}
                  stage={stage}
                  count={colItems.length}
                  total={total}
                  isOver={overCol === stage}
                >
                  {colItems.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[13px] text-ink-subtle">Nothing here.</p>
                  ) : (
                    colItems.map((r) => (
                      <PipelineCard
                        key={r.id}
                        r={r}
                        saving={savingId === r.id}
                        onEdit={() => {
                          setEditing(r);
                          setDrawerOpen(true);
                        }}
                        onStage={(s) => void changeStage(r.id, s)}
                      />
                    ))
                  )}
                </PipelineColumn>
              );
            })}
          </div>

          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
            {activeCard ? (
              <div className="w-[300px] rotate-2 cursor-grabbing rounded-chip border border-altus-red/40 bg-white p-3.5 shadow-2xl">
                <span className="block text-[15px] font-semibold leading-snug text-ink-strong">
                  {activeCard.prospectName}
                </span>
                <span className="mt-1 block text-[12.5px] text-ink-subtle">{activeCard.ambassadorName}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <PipelineTable
          rows={filtered}
          savingId={savingId}
          onEdit={(r) => {
            setEditing(r);
            setDrawerOpen(true);
          }}
          onStage={(id, s) => void changeStage(id, s)}
        />
      )}

      <ReferralDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ambassadors={ambassadors}
        products={products}
        employees={employees}
        initial={editing}
      />
    </div>
  );
}

// ── Filter select ────────────────────────────────────────────────────────────
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-xl border border-hairline-strong bg-white py-2.5 pl-3.5 pr-9 text-[13.5px] font-bold text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)]"
        style={value ? { borderColor: "var(--color-altus-red)" } : undefined}
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={2.4}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}

// ── Column (drop target) ─────────────────────────────────────────────────────
function PipelineColumn({
  stage,
  count,
  total,
  isOver,
  children,
}: {
  stage: Stage;
  count: number;
  total: number;
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: stage });
  const { accent, deep, tint } = toneVars(STAGE_TONES[stage]);
  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 w-[300px] max-sm:w-[85vw] max-sm:snap-center rounded-section p-3.5 transition-colors"
      style={{
        background: isOver ? tint : "var(--color-surface-soft)",
        border: `1px solid ${isOver ? accent : "var(--color-hairline)"}`,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -18px rgba(15,23,42,0.20)",
        touchAction: "manipulation",
      }}
    >
      <div
        className="sticky top-0 z-20 -mx-3.5 -mt-3.5 mb-3 flex items-center justify-between px-3.5 pb-2.5 pt-3.5"
        style={{
          background: "var(--color-surface-soft)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <span className="inline-flex min-w-0 items-center gap-2 text-[14.5px] font-bold" style={{ color: deep }}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="truncate">{STAGE_LABELS[stage]}</span>
        </span>
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink-subtle">{count}</span>
      </div>
      {total > 0 && (
        <div className="-mt-1.5 mb-2 px-0.5 text-[12px] font-bold tabular-nums" style={{ color: deep }}>
          {inrCompact(total)}
        </div>
      )}
      <div className="flex min-h-[40px] flex-col gap-2">{children}</div>
    </div>
  );
}

// ── Card (draggable) ─────────────────────────────────────────────────────────
function PipelineCard({
  r,
  saving,
  onEdit,
  onStage,
}: {
  r: ReferralRow;
  saving: boolean;
  onEdit: () => void;
  onStage: (s: Stage) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: r.id });
  const { accent, deep } = toneVars(STAGE_TONES[r.stage]);

  return (
    <div
      className="group rounded-chip border border-hairline bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-altus-red/40 hover:shadow-lg"
      style={{ opacity: isDragging ? 0.4 : 1, borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Drag handle keeps the rest of the card clickable/keyboard-usable. */}
        <button
          type="button"
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${r.prospectName}`}
          className="-ml-1 mt-0.5 shrink-0 cursor-grab touch-none text-ink-subtle hover:text-ink-strong active:cursor-grabbing"
        >
          <GripVertical size={15} strokeWidth={2.2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left text-[15px] font-semibold leading-snug text-ink-strong hover:underline"
        >
          {r.prospectName}
        </button>
        {saving && <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-ink-subtle" />}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-muted">
        <Avatar name={r.ambassadorName} size={20} />
        <span className="truncate font-medium">{r.ambassadorName}</span>
      </div>

      {r.prospectCompany && (
        <div className="mt-1 truncate text-[12.5px] text-ink-subtle">{r.prospectCompany}</div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-bold tabular-nums text-ink-strong">
          {r.dealAmount != null ? inr(r.dealAmount) : "—"}
        </span>
        {r.commissionAmount != null && (
          <span
            className="rounded-pill px-2 py-0.5 text-[11.5px] font-bold tabular-nums"
            style={{
              color: deep,
              background: "color-mix(in srgb, var(--color-green) 12%, transparent)",
            }}
          >
            {inrCompact(r.commissionAmount)} comm.
          </span>
        )}
      </div>

      {/* Keyboard-accessible stage fallback (drag is mouse-only). */}
      <div className="relative mt-2.5">
        <label className="sr-only" htmlFor={`stage-${r.id}`}>
          Stage for {r.prospectName}
        </label>
        <select
          id={`stage-${r.id}`}
          value={r.stage}
          onChange={(e) => onStage(e.target.value as Stage)}
          disabled={saving}
          className="w-full cursor-pointer appearance-none rounded-lg border border-hairline bg-surface-soft py-1.5 pl-2.5 pr-7 text-[12.5px] font-bold text-ink-soft outline-none transition-colors focus:border-[color:var(--color-altus-red)] disabled:opacity-60"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          strokeWidth={2.4}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
      </div>
    </div>
  );
}

// ── Table view ───────────────────────────────────────────────────────────────
function PipelineTable({
  rows,
  savingId,
  onEdit,
  onStage,
}: {
  rows: ReferralRow[];
  savingId: string | null;
  onEdit: (r: ReferralRow) => void;
  onStage: (id: string, s: Stage) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white px-6 py-16 text-center">
        <p className="text-[14.5px] font-semibold text-ink-muted">No referrals match these filters.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-hairline bg-white" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline" style={{ background: "var(--color-surface-soft)" }}>
            {["Prospect", "Ambassador", "Owner", "Amount", "Commission", "Stage", "Client"].map((h, i) => (
              <th
                key={h}
                className={
                  "px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-soft " +
                  (i >= 3 && i <= 4 ? "text-right" : "")
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-hairline transition-colors last:border-0 hover:bg-surface-soft">
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  className="text-left text-[14.5px] font-semibold text-ink-strong hover:underline"
                >
                  {r.prospectName}
                </button>
                {r.prospectCompany && (
                  <div className="text-[12.5px] text-ink-subtle">{r.prospectCompany}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <Avatar name={r.ambassadorName} size={22} />
                  <span className="text-[13.5px] font-medium text-ink-soft">{r.ambassadorName}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-[13.5px] text-ink-soft">{r.assignedToName ?? "—"}</td>
              <td className="px-4 py-3 text-right text-[14px] font-bold tabular-nums text-ink-strong">
                {r.dealAmount != null ? inr(r.dealAmount) : "—"}
              </td>
              <td className="px-4 py-3 text-right text-[13.5px] font-semibold tabular-nums text-ink-soft">
                {r.commissionAmount != null ? inr(r.commissionAmount) : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="relative inline-flex items-center">
                  <select
                    aria-label={`Stage for ${r.prospectName}`}
                    value={r.stage}
                    onChange={(e) => onStage(r.id, e.target.value as Stage)}
                    disabled={savingId === r.id}
                    className="cursor-pointer appearance-none rounded-pill border border-hairline bg-white py-1.5 pl-3 pr-8 text-[12.5px] font-bold text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)] disabled:opacity-60"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {savingId === r.id ? (
                    <Loader2 size={13} className="pointer-events-none absolute right-2.5 animate-spin text-ink-subtle" />
                  ) : (
                    <ChevronDown
                      size={13}
                      strokeWidth={2.4}
                      className="pointer-events-none absolute right-2.5 text-ink-subtle"
                    />
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                {r.clientId ? (
                  <Link
                    href={`/clients/${r.clientId}` as Route}
                    className="text-[13px] font-semibold text-altus-red hover:underline"
                  >
                    View
                  </Link>
                ) : (
                  <span className="text-[13px] text-ink-subtle">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
