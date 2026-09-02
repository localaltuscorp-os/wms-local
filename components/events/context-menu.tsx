"use client";

/**
 * Right-click context menu for an event (design §3): Copy / Cut / Paste /
 * Duplicate / Change colour / Change category / Toggle status / (Un)lock /
 * Delete. Colour + category open an inline sub-grid rather than a floating
 * submenu (simpler, keyboard-reachable). Closes on outside-click or Escape.
 */
import * as React from "react";
import {
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Palette,
  Tag,
  CircleDot,
  Lock,
  LockOpen,
  Trash2,
  Pencil,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent, EventCategory } from "@/lib/monthly-events/types";
import { EVENT_PALETTE } from "./colors";

function Item({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
  hasSub,
  kbd,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  hasSub?: boolean;
  kbd?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-surface-soft",
        danger ? "text-red-600" : "text-ink-strong",
      )}
    >
      <Icon size={14} className="shrink-0 opacity-80" />
      <span className="flex-1">{label}</span>
      {kbd && <span className="text-[10px] text-ink-soft">{kbd}</span>}
      {hasSub && <ChevronRight size={13} className="text-ink-soft" />}
    </button>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  event: CalendarEvent;
  categories: EventCategory[];
  canPaste: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onSetColour: (hex: string | null) => void;
  onSetCategory: (id: string | null) => void;
  onToggleStatus: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}

export function ContextMenu(props: ContextMenuProps) {
  const { x, y, event, categories, canPaste, onClose } = props;
  const ref = React.useRef<HTMLDivElement>(null);
  const [sub, setSub] = React.useState<"colour" | "category" | null>(null);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 230),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 360),
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[200] w-56 rounded-xl border border-hairline-strong bg-surface-card p-1.5 shadow-xl"
      style={{ ...style, boxShadow: "0 12px 32px rgba(15,23,42,0.18)" }}
    >
      <Item icon={Pencil} label="Edit details…" onClick={props.onEdit} />
      <div className="my-1 h-px bg-hairline" />
      <Item icon={Copy} label="Copy" kbd="⌘C" onClick={props.onCopy} />
      <Item icon={Scissors} label="Cut" kbd="⌘X" onClick={props.onCut} />
      <Item icon={ClipboardPaste} label="Paste Here" kbd="⌘V" disabled={!canPaste} onClick={props.onPaste} />
      <Item icon={CopyPlus} label="Duplicate" onClick={props.onDuplicate} />

      <div className="my-1 h-px bg-hairline" />

      <Item
        icon={Palette}
        label="Change Colour"
        hasSub
        onClick={() => setSub((s) => (s === "colour" ? null : "colour"))}
      />
      {sub === "colour" && (
        <div className="grid grid-cols-8 gap-1 px-2 py-1.5">
          {EVENT_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              onClick={() => props.onSetColour(hex)}
              className="h-5 w-5 rounded-[5px] ring-1 ring-black/10 transition-transform hover:scale-110"
              style={{ background: hex }}
            />
          ))}
          <button
            type="button"
            onClick={() => props.onSetColour(null)}
            className="col-span-8 mt-1 rounded-md px-2 py-1 text-left text-[11.5px] font-medium text-ink-muted hover:bg-surface-soft"
          >
            Reset to Category Colour
          </button>
        </div>
      )}

      <Item
        icon={Tag}
        label="Change Category"
        hasSub
        onClick={() => setSub((s) => (s === "category" ? null : "category"))}
      />
      {sub === "category" && (
        <div className="max-h-40 overflow-y-auto px-1 py-0.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => props.onSetCategory(c.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-surface-soft",
                event.categoryId === c.id && "bg-surface-soft font-semibold",
              )}
            >
              <span className="h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-black/10" style={{ background: c.color }} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => props.onSetCategory(null)}
            className="w-full rounded-md px-2 py-1 text-left text-[11.5px] font-medium text-ink-muted hover:bg-surface-soft"
          >
            Clear Category
          </button>
        </div>
      )}

      <Item
        icon={CircleDot}
        label={event.status === "confirmed" ? "Mark Tentative" : "Mark Confirmed"}
        onClick={props.onToggleStatus}
      />
      <Item
        icon={event.isLocked ? LockOpen : Lock}
        label={event.isLocked ? "Unlock (Override)" : "Lock"}
        onClick={props.onToggleLock}
      />

      <div className="my-1 h-px bg-hairline" />
      <Item icon={Trash2} label="Delete" kbd="Del" danger onClick={props.onDelete} />
    </div>
  );
}
