"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, Check, Users2, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { SalaryPerson, SalaryScope } from "@/lib/salary/salary-people";

const MENU_WIDTH = 300;

/**
 * The person switcher for My Salary — shown only to admins (every employee) and
 * managers (their team). Regular employees never see it. Selecting a person
 * navigates to `/my-salary?emp=<id>`; picking yourself returns to `/my-salary`.
 *
 * The menu is rendered through a PORTAL to <body>, positioned `fixed` under the
 * trigger. It has to be: the picker lives inside PageCommandBar, which is
 * `overflow-hidden` (rounded card), and an in-flow absolute menu was clipped to
 * a sliver — the search box showed but the list was cut off. A portal escapes
 * that clip entirely.
 */
export function SalaryPersonPicker({
  people,
  selectedId,
  selfId,
  scope,
}: {
  people: SalaryPerson[];
  selectedId: string;
  selfId: string;
  scope: SalaryScope;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = people.find((p) => p.id === selectedId);
  const label = scope === "all" ? "Viewing" : "Team member";

  const place = React.useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    // Align the menu's right edge to the button's, but keep it on-screen.
    const left = Math.max(8, Math.min(b.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top: b.bottom + 8, left });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    place();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    // `true` → catch scrolls on any ancestor, not just the window.
    window.addEventListener("scroll", place, true);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      clearTimeout(t);
    };
  }, [open, place]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) => p.name.toLowerCase().includes(needle));
  }, [people, q]);

  function choose(id: string) {
    setOpen(false);
    if (id === selectedId) return;
    setPendingId(id);
    router.push(id === selfId ? "/my-salary" : `/my-salary?emp=${id}`);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:border-altus-red"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {pendingId ? (
          <Loader2 size={15} className="animate-spin text-ink-muted" />
        ) : (
          <Users2 size={15} className="text-ink-muted" strokeWidth={2.3} />
        )}
        <span className="max-w-[180px] truncate">
          <span className="text-ink-subtle">{label}: </span>
          {selected?.name ?? "Select person"}
        </span>
        <ChevronDown size={15} className="text-ink-subtle" />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="z-[90] overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-xl"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
          >
            <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
              <Search size={15} className="shrink-0 text-ink-subtle" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="w-full bg-transparent text-[13.5px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle"
              />
            </div>
            <div className="max-h-[340px] overflow-y-auto py-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-ink-muted">No one matches.</p>
              ) : (
                filtered.map((p) => {
                  const on = p.id === selectedId;
                  const isSelf = p.id === selfId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => choose(p.id)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${on ? "bg-surface-soft" : "hover:bg-surface-soft"}`}
                    >
                      <Avatar name={p.name} avatarUrl={p.avatarUrl} size={26} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-strong">
                        {p.name}
                        {isSelf && <span className="ml-1.5 text-[11px] font-bold text-ink-subtle">(you)</span>}
                      </span>
                      {on && <Check size={15} className="shrink-0 text-[color:var(--color-altus-red)]" strokeWidth={2.6} />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
