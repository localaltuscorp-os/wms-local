"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { BellRing, X } from "lucide-react";

const RED = "var(--color-altus-red)";

export type QueryNotification = {
  id: string;
  title: string;
  href: string | null;
  unread: boolean;
  timeLabel: string;
};

/** A compact inbox that keeps HR updates available without reserving a blank side column. */
export function NotificationInboxButton({ items }: { items: QueryNotification[] }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const unread = items.filter((item) => item.unread).length;

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Open notifications, ${unread} unread` : "Open notifications"}
        className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface-card px-3 text-[12px] font-bold text-ink-strong transition hover:border-[var(--color-altus-red)] hover:text-[var(--color-altus-red)]"
      >
        <BellRing size={16} strokeWidth={2.2} aria-hidden />
        <span>Notifications</span>
        {unread > 0 && (
          <span
            className="grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-black text-white"
            style={{ background: RED }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+10px)] z-50 flex h-[360px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)]"
        >
          <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <div>
              <h2 className="text-[14px] font-bold text-ink-strong">Notifications</h2>
              <p className="text-[11.5px] text-ink-muted">
                {unread ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You are all caught up"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-soft hover:text-ink-strong"
              aria-label="Close notifications"
            >
              <X size={16} aria-hidden />
            </button>
          </header>

          {items.length === 0 ? (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <BellRing size={24} className="mx-auto text-ink-subtle" aria-hidden />
                <p className="mt-2 text-[13px] font-semibold text-ink-strong">Nothing yet</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                  Replies from HR will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {items.map((item) => {
                const row = (
                  <div className="rounded-xl px-3 py-3 transition hover:bg-surface-soft">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.unread ? "" : "invisible"}`}
                        style={{ background: RED }}
                        aria-hidden
                      />
                      <span className={`text-[13px] text-ink-strong ${item.unread ? "font-bold" : "font-medium"}`}>
                        {item.title}
                      </span>
                    </div>
                    <span className="ml-3.5 mt-1 block text-[11px] text-ink-muted">{item.timeLabel}</span>
                  </div>
                );
                return <li key={item.id}>{item.href ? <Link href={item.href as Route} onClick={() => setOpen(false)}>{row}</Link> : row}</li>;
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
