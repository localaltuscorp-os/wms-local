"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsDown,
  ChevronsUp,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import {
  DEFAULT_LAYOUT,
  DEFAULT_PREFERENCES,
  DENSITY_LABEL,
  LAYOUT_STORAGE_KEY,
  SIZE_LABEL,
  WIDGETS,
  hiddenWidgets,
  readPreferences,
  reconcileLayout,
  type Density,
  type Preferences,
  type StoredLayout,
  type WidgetId,
  type WidgetPlacement,
  type WidgetSize,
} from "@/lib/dashboard/widgets";

/**
 * THE HOME SCREEN IS THE USER'S, not ours.
 *
 * Every widget can be resized to one of three widths, pushed up or down, taken
 * off, or put back. This component owns that arrangement; it does NOT own the
 * widgets themselves — those arrive already rendered, on the server, in the
 * `nodes` map. That split is the whole design:
 *
 *   the server fetches and renders every widget body
 *   this client component only decides ORDER, SIZE and PRESENCE
 *
 * so none of the dashboard's data has to cross to the client, and a widget can
 * stay an async Server Component while still being draggable furniture.
 *
 * WHERE THE LAYOUT LIVES. `localStorage`, per browser. It is not on the
 * employee row, and that is a deliberate trade rather than an oversight: a
 * column would mean a migration, and migrations on this project are applied to
 * production by hand. Nothing here is worth that risk. The cost is real and
 * worth saying out loud — the arrangement does not follow you to another
 * device, and clearing site data resets it to the default.
 */

/* `useSyncExternalStore` needs a getSnapshot that returns the SAME reference
   until something actually changes, or React re-renders forever. So the parsed
   layout is cached here and the cache is only invalidated on a write. */
let cached: { raw: string | null; value: unknown } = { raw: null, value: null };
const listeners = new Set<() => void>();

function readStore(): unknown {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage — the default layout is the answer.
    return null;
  }
  if (raw !== cached.raw) {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null; // corrupt; reconcileLayout will fall back to the default
    }
    cached = { raw, value: parsed };
  }
  return cached.value;
}

function writeStore(next: StoredLayout): void {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: the change still applies for this session.
  }
  cached = { raw: null, value: null }; // force a re-parse on the next read
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab rearranging the dashboard should be reflected here too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function DashboardGrid({
  nodes,
  available,
  greeting,
}: {
  /** Widget bodies, rendered on the server. Keyed by widget id. */
  nodes: Partial<Record<WidgetId, React.ReactNode>>;
  /** Which widgets this viewer may see at all — permissions and data. */
  available: WidgetId[];
  /** The date + "Good morning" block. Rendered HERE so it can be switched off
   *  with everything else, rather than being the one fixed thing on a page
   *  whose entire point is that nothing is fixed. */
  greeting?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  const stored = React.useSyncExternalStore(
    subscribe,
    readStore,
    // The server has no storage, so it renders the default. The first client
    // render matches it, then the subscription corrects to the saved layout.
    () => null,
  );

  const layout = React.useMemo(() => reconcileLayout(stored, available), [stored, available]);
  const hidden = React.useMemo(() => hiddenWidgets(layout, available), [layout, available]);
  const prefs = React.useMemo(() => readPreferences(stored), [stored]);

  /* Every mutation writes the WHOLE arrangement, including which widgets are
     off. See `StoredLayout.removed` for why "off" has to be recorded rather
     than inferred from absence. */
  const commit = React.useCallback(
    (shown: WidgetPlacement[], next?: Partial<Preferences>) => {
      const on = new Set(shown.map((w) => w.id));
      const p = { ...DEFAULT_PREFERENCES, ...prefs, ...next };
      writeStore({
        v: 1,
        shown,
        removed: available.filter((id) => !on.has(id)),
        density: p.density,
        greeting: p.greeting,
      });
    },
    [available, prefs],
  );

  const setPref = (next: Partial<Preferences>) => commit(layout, next);

  const move = (index: number, by: -1 | 1) => {
    const next = [...layout];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to]!, next[index]!];
    commit(next);
  };

  /* Fourteen widgets is far enough that stepping one at a time is a chore, and
     a drag target on a grid that reflows under the pointer is worse than both
     — so the ends get their own buttons. */
  const moveTo = (index: number, edge: "top" | "bottom") => {
    const next = [...layout];
    const [w] = next.splice(index, 1);
    if (!w) return;
    if (edge === "top") next.unshift(w);
    else next.push(w);
    commit(next);
  };

  const resize = (index: number, size: WidgetSize) => {
    const next = [...layout];
    next[index] = { ...next[index]!, size };
    commit(next);
  };

  const remove = (index: number) => commit(layout.filter((_, i) => i !== index));

  const add = (id: WidgetId) => {
    commit([...layout, { id, size: WIDGETS[id].defaultSize }]);
    setAdding(false);
  };

  const reset = () => {
    const allow = new Set(available);
    commit(
      DEFAULT_LAYOUT.filter((d) => allow.has(d.id)).map((d) => ({ ...d })),
      DEFAULT_PREFERENCES,
    );
  };

  return (
    <>
      {prefs.greeting && greeting}

      <div className="aura-grid-head">
        <h2 className="aura-h2">Your dashboard</h2>
        <div className="aura-edit-bar">
          {editing && (
            <>
              <span className="aura-pref">
                Density
                <span className="aura-pref-seg" role="group" aria-label="Density">
                  {(["comfortable", "compact"] as Density[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={prefs.density === d}
                      onClick={() => setPref({ density: d })}
                    >
                      {DENSITY_LABEL[d]}
                    </button>
                  ))}
                </span>
              </span>

              <button
                type="button"
                className="aura-edit-btn"
                aria-pressed={prefs.greeting}
                onClick={() => setPref({ greeting: !prefs.greeting })}
              >
                {prefs.greeting ? "Hide greeting" : "Show greeting"}
              </button>

              <button type="button" className="aura-edit-btn" onClick={reset}>
                Reset to default
              </button>
              <button
                type="button"
                className="aura-edit-btn"
                onClick={() => setAdding((a) => !a)}
                aria-expanded={adding}
                disabled={hidden.length === 0}
              >
                <Plus size={13} strokeWidth={2.6} aria-hidden />
                Add widget{hidden.length > 0 ? ` (${hidden.length})` : ""}
              </button>
            </>
          )}
          <button
            type="button"
            className={editing ? "aura-edit-btn is-on" : "aura-edit-btn"}
            onClick={() => {
              setEditing((e) => !e);
              setAdding(false);
            }}
            aria-pressed={editing}
          >
            {editing ? (
              <>
                <Check size={13} strokeWidth={2.8} aria-hidden />
                Done
              </>
            ) : (
              <>
                <Settings2 size={13} strokeWidth={2.4} aria-hidden />
                Customise
              </>
            )}
          </button>
        </div>
      </div>

      {editing && adding && hidden.length > 0 && (
        <div className="aura-glass aura-add-panel">
          {hidden.map((w) => (
            <button key={w.id} type="button" className="aura-add-item" onClick={() => add(w.id)}>
              <Plus size={14} strokeWidth={2.6} aria-hidden />
              <span>
                <span className="aura-add-name">{w.title}</span>
                <span className="aura-add-blurb">{w.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className={editing ? "aura-wgrid is-editing" : "aura-wgrid"}
        data-density={prefs.density}
      >
        {layout.map((w, i) => {
          const spec = WIDGETS[w.id];
          const body = nodes[w.id];
          if (!body) return null;
          return (
            <section key={w.id} className="aura-w" data-size={w.size} aria-label={spec.title}>
              {editing && (
                <div className="aura-w-bar">
                  <span className="aura-w-name">{spec.title}</span>

                  <span className="aura-w-sizes" role="group" aria-label={`${spec.title} size`}>
                    {spec.sizes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="aura-w-size"
                        aria-pressed={w.size === s}
                        title={SIZE_LABEL[s]}
                        onClick={() => resize(i, s)}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </span>

                  <span className="aura-w-group">
                    <button
                      type="button"
                      className="aura-w-btn"
                      title="Move to top"
                      aria-label={`Move ${spec.title} to the top`}
                      disabled={i === 0}
                      onClick={() => moveTo(i, "top")}
                    >
                      <ChevronsUp size={13} strokeWidth={2.6} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="aura-w-btn"
                      title="Move up"
                      aria-label={`Move ${spec.title} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={13} strokeWidth={2.6} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="aura-w-btn"
                      title="Move down"
                      aria-label={`Move ${spec.title} down`}
                      disabled={i === layout.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={13} strokeWidth={2.6} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="aura-w-btn"
                      title="Move to bottom"
                      aria-label={`Move ${spec.title} to the bottom`}
                      disabled={i === layout.length - 1}
                      onClick={() => moveTo(i, "bottom")}
                    >
                      <ChevronsDown size={13} strokeWidth={2.6} aria-hidden />
                    </button>
                  </span>
                  <button
                    type="button"
                    className="aura-w-btn aura-w-remove"
                    title="Remove"
                    aria-label={`Remove ${spec.title}`}
                    onClick={() => remove(i)}
                  >
                    <X size={13} strokeWidth={2.8} aria-hidden />
                  </button>
                </div>
              )}
              <div className="aura-w-body">{body}</div>
            </section>
          );
        })}
      </div>

      {layout.length === 0 && (
        <div className="aura-glass aura-empty">
          Your dashboard is empty. Hit <strong>Customise</strong> to put something back.
        </div>
      )}
    </>
  );
}
