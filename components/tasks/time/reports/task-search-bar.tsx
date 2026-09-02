"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { Search, X } from "lucide-react";

/** Searchable task-report filter — keyboard-first: Enter searches, Esc clears. */
export function TaskSearchBar({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function submit(value: string) {
    const v = value.trim();
    router.push((v ? `/tasks/time/tasks?q=${encodeURIComponent(v)}` : "/tasks/time/tasks") as Route);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(q);
      }}
      className="flex items-center gap-2"
    >
      <div
        className="flex items-center gap-2 rounded-full px-4 py-2.5 w-full max-w-[440px]"
        style={{ background: "rgba(255,255,255,0.85)", border: "1px solid var(--color-hairline)" }}
      >
        <Search size={16} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} aria-hidden />
        <input
          type="text"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setQ("");
              submit("");
            }
          }}
          placeholder="Local search — tasks by title, number, client or subject" title="Local search — filters only the list on this page" aria-label="Local search — tasks by title, number, client or subject — this page only"
          className="w-full bg-transparent outline-none text-ink-strong"
          style={{ fontSize: 14, fontWeight: 600 }}
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              submit("");
            }}
            className="shrink-0 text-ink-subtle hover:text-[var(--color-altus-red)] transition-colors"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        )}
      </div>
      <button
        type="submit"
        className="wg-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 font-bold text-white transition-transform active:scale-[0.98]"
        style={{ background: "var(--color-altus-red)", fontSize: 13.5 }}
      >
        Search
      </button>
    </form>
  );
}
