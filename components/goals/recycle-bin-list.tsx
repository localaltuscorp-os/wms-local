"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, Loader2, Archive } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { restoreTask, purgeTask } from "@/app/(app)/goals/recycle-bin/actions";

const THEME_ACCENT = "#E10600";

export interface BinItem {
  id: string;
  taskNo: number | null;
  title: string;
  client: string | null;
  doerName: string | null;
  abandonedByName: string | null;
  abandonedAt: string | null;
}

/** Deterministic IST date label (same on server + client → no hydration drift). */
function whenLabel(iso: string | null): string {
  if (!iso) return "";
  return formatDate(iso);
}

/**
 * One list, two families. Abandoned TASKS and cancelled DAILY COMMITMENTS
 * (migration 0186) look identical in the bin and offer the same two verbs, so
 * the actions are props rather than a second near-identical component.
 */
export function RecycleBinList({
  items: initial,
  restore = restoreTask,
  purge = purgeTask,
  restoredMessage = "Restored to the daily loop.",
}: {
  items: BinItem[];
  restore?: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  purge?: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  restoredMessage?: string;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  React.useEffect(() => setItems(initial), [initial]);

  const onRestore = (it: BinItem) => {
    setBusy(it.id);
    void restore(it.id)
      .then((r) => {
        if (r.ok) {
          setItems((p) => p.filter((x) => x.id !== it.id));
          fireToast({ message: restoredMessage, type: "success" });
          router.refresh();
        } else fireToast({ message: r.error, type: "error" });
      })
      .finally(() => setBusy(null));
  };

  const onPurge = (it: BinItem) => {
    setBusy(it.id);
    void purge(it.id)
      .then((r) => {
        if (r.ok) {
          setItems((p) => p.filter((x) => x.id !== it.id));
          fireToast({ message: "Permanently deleted.", type: "success" });
        } else fireToast({ message: r.error, type: "error" });
      })
      .finally(() => {
        setBusy(null);
        setConfirmId(null);
      });
  };

  if (items.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-2xl border border-hairline-strong py-16 text-center wg-rise">
        <span className="grid size-14 place-items-center rounded-2xl bg-surface-soft text-ink-muted">
          <Archive size={26} />
        </span>
        <p className="text-[15px] font-semibold text-ink-soft">The Recycle Bin is empty.</p>
        <p className="max-w-[40ch] text-[13px] text-ink-muted">
          When someone abandons a task from Plan my day, it lands here for you to restore or delete.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li
          key={it.id}
          className="wg-rise flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {it.taskNo != null && (
                <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink-muted">
                  #{it.taskNo}
                </span>
              )}
              <span className="truncate text-[15px] font-semibold text-ink-strong" style={{ overflowWrap: "anywhere" }}>
                {it.title}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-ink-muted">
              {[it.doerName && `Owner: ${it.doerName}`, it.client, it.abandonedByName && `Abandoned by ${it.abandonedByName}`, whenLabel(it.abandonedAt)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onRestore(it)}
            disabled={busy === it.id}
            className="inline-flex h-9 items-center gap-1.5 rounded-chip border border-hairline bg-surface-card px-3 text-[13px] font-bold text-ink-strong transition-colors hover:border-hairline-strong disabled:opacity-50"
            style={{ color: THEME_ACCENT }}
          >
            {busy === it.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restore
          </button>

          {confirmId === it.id ? (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPurge(it)}
                disabled={busy === it.id}
                className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {busy === it.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="bg-surface-card inline-flex h-9 items-center rounded-chip border border-hairline px-3 text-[13px] font-semibold text-ink-soft"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmId(it.id)}
              disabled={busy === it.id}
              aria-label={`Permanently delete ${it.title}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-chip text-ink-muted transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-[color:var(--color-altus-red)] disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
