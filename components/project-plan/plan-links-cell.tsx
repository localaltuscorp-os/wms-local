"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, X, SquareArrowOutUpRight, Trash2, Plus, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { updatePlanNode } from "@/app/(app)/project-plan/actions";

/** The plan module's red, matching the attachments cell beside this one. */
const ACCENT_DEEP = "#A80400";
const ACCENT_WASH = "#FDF0F0";
const ACCENT_WASH_HOVER = "#FAE2E2";

/**
 * The tallest the panel gets — header, a full scrolled list, the add row and
 * the padding around them. Used only to decide which way to open, so it wants
 * to be a slight over-estimate: guessing too big drops a panel below the
 * trigger that would just have fitted above, which is merely the old
 * behaviour, while guessing too small opens one upward off the top of the
 * window.
 */
const PANEL_MAX_H = 320;

/**
 * Project Plan — the Links cell.
 *
 * The sibling of `PlanAttachmentCell`, and deliberately the same shape on
 * screen AND the same behaviour: red once the row carries something, opens on
 * hover, click to pin, every entry removable, one control to add. The two sit
 * side by side in every register — two cells that look identical and answer to
 * different gestures would be worse than either choice on its own.
 *
 * The difference is only where the list comes from. An attachment costs a
 * signed URL per file and so is fetched on open; links are a few lines of text
 * that already rode down with the row, so there is nothing to fetch and nothing
 * to wait for.
 *
 * WRITES GO THROUGH `updatePlanNode`, the same action the Edit dialog and every
 * inline cell use — links are a column on the row, not a table of their own, so
 * a change here is an ordinary row update and the server re-checks the same
 * permission it always does. The list is held locally while the router
 * refreshes, so the count settles immediately instead of after a round-trip.
 */
export function PlanLinksCell({
  links,
  label,
  nodeId,
  canManage,
}: {
  links: string[];
  label: string;
  nodeId: string;
  /** Gates add and remove. Without it the cell is the read-only list it was. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  /** Opened by a CLICK — hover-out must not close it mid-edit. */
  const [pinned, setPinned] = React.useState(false);
  const [list, setList] = React.useState(links);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const closeTimer = React.useRef<number | null>(null);

  // The register re-renders with the row's fresh links after a revalidate;
  // adopt them DURING RENDER, the same pattern the attachment count uses, so
  // this cell never sticks on a stale local list.
  const [lastServer, setLastServer] = React.useState(links);
  if (lastServer !== links) {
    setLastServer(links);
    setList(links);
  }

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  React.useEffect(() => cancelClose, [cancelClose]);

  function close() {
    cancelClose();
    setOpen(false);
    setPinned(false);
    setDraft("");
  }

  /**
   * Which way the panel opens. ABOVE the trigger by default — these cells sit
   * near the right-hand end of a long register, where the rows people actually
   * click are far more often down the page than at the top of it, and a panel
   * dropped downward from there falls off the bottom of the window.
   *
   * Flipped back to below only when the trigger is too close to the top of the
   * window for the panel to fit above it, which is the same prefer-one-side-
   * then-flip rule `HoverTip` uses.
   */
  const [below, setBelow] = React.useState(true);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  /** Measured at OPEN time, not on every render: the answer only changes when
   *  the panel appears, and a render-time rect read would thrash on scroll. */
  const place = React.useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Below by default; up only when the panel genuinely cannot fit down
    // there AND can fit up here.
    const roomBelow = window.innerHeight - r.bottom;
    setBelow(roomBelow >= PANEL_MAX_H + 12 || r.top < PANEL_MAX_H + 12);
  }, []);

  /** Hover opens — mouse only, so a tap on a phone does not open it in passing. */
  function onEnter(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    place();
    setOpen(true);
  }

  function onLeave(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || pinned || busy) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  function toggle() {
    if (open && pinned) {
      close();
      return;
    }
    cancelClose();
    place();
    setOpen(true);
    setPinned(true);
  }

  /** Write the whole list — `links` is one array column, so every change is a
   *  replace, not a per-row insert or delete. */
  async function commit(next: string[], done: string) {
    const previous = list;
    setList(next);
    setBusy(true);
    try {
      const res = await updatePlanNode({ id: nodeId, links: next });
      if (!res.ok) {
        setList(previous);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: done, type: "success" });
      router.refresh();
    } catch {
      setList(previous);
      fireToast({ message: "That change didn't go through.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  function addDraft() {
    const url = normaliseUrl(draft);
    if (!url) {
      fireToast({ message: "That doesn't look like a web address.", type: "error" });
      return;
    }
    if (list.includes(url)) {
      fireToast({ message: "That link is already on this row.", type: "error" });
      return;
    }
    setDraft("");
    void commit([...list, url], "Link added.");
  }

  const count = list.length;
  const title = count === 0 ? `No links on ${label}` : `${count} link${count === 1 ? "" : "s"} on ${label}`;

  return (
    <div className="relative" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={title}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold transition-colors"
        style={
          count > 0
            ? { color: ACCENT_DEEP, background: open ? ACCENT_WASH_HOVER : ACCENT_WASH }
            : { color: "var(--color-ink-subtle)" }
        }
      >
        <Link2 size={13} strokeWidth={2.4} className="shrink-0" aria-hidden />
        {count > 0 ? count : "—"}
      </button>

      {open && (
        <>
          {/* Click-away, only once PINNED — a hover-opened panel closes itself
              on the way out, and a full-screen overlay under one that is merely
              hovered would swallow clicks meant for the row. */}
          {pinned && (
            <button
              type="button"
              aria-label="Close links"
              onClick={close}
              className="fixed inset-0 z-[40] cursor-default"
            />
          )}
          {/* PADDING rather than a margin, either way up: the gap between the
              trigger and the panel has to be INSIDE the hover area, or
              crossing it counts as leaving and the panel shuts in your face. */}
          <div
            className={`absolute right-0 z-[41] ${below ? "top-full pt-1" : "bottom-full pb-1"}`}
          >
            <div className="w-[320px] rounded-xl border border-hairline-strong bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
                  {count === 0 ? "Links" : `${count} link${count === 1 ? "" : "s"}`}
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="text-ink-subtle hover:text-ink-strong"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              </div>

              {count === 0 ? (
                <p className="py-2 text-[13px] font-medium text-ink-muted">No links yet.</p>
              ) : (
                <ul className="mb-2 max-h-[210px] space-y-1 overflow-auto">
                  {list.map((url, i) => (
                    <li
                      key={`${url}-${i}`}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-soft"
                    >
                      <SquareArrowOutUpRight size={12} className="shrink-0 text-ink-subtle" aria-hidden />
                      {/* `noopener noreferrer` because these are URLs somebody
                          typed: the new tab must not get a handle on this one. */}
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={url}
                        className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-strong hover:underline"
                      >
                        {prettyUrl(url)}
                      </a>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void commit(list.filter((_, j) => j !== i), "Link removed.")}
                          disabled={busy}
                          aria-label={`Remove ${url}`}
                          title="Remove this link"
                          className="shrink-0 text-ink-subtle transition-colors hover:text-[#B4160E] disabled:opacity-40"
                        >
                          <Trash2 size={13} strokeWidth={2.2} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canManage && (
                <div className="flex items-center gap-1.5">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    // Enter adds, because this input has no form around it and
                    // reaching for the button after every paste is the whole
                    // friction of adding three links in a row.
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addDraft();
                      }
                    }}
                    placeholder="Paste a link…"
                    disabled={busy}
                    aria-label="New link"
                    className="min-w-0 flex-1 rounded-lg border border-hairline-strong bg-white px-2 py-1.5 text-[12.5px] font-medium text-ink-strong outline-none transition-colors focus:border-[#E10600] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={addDraft}
                    disabled={busy || !draft.trim()}
                    aria-label="Add link"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hairline-strong px-2 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden />
                    ) : (
                      <Plus size={13} strokeWidth={2.6} aria-hidden />
                    )}
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What somebody pasted → a URL worth storing, or null.
 *
 * A bare "docs.google.com/…" is what people actually paste out of an address
 * bar, and storing it unchanged gives an `<a href>` the browser reads as a
 * RELATIVE path — the link would quietly point back into this app. So a missing
 * scheme becomes `https://`, and anything that still will not parse is refused
 * rather than saved as a link that goes nowhere.
 */
export function normaliseUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    // `javascript:` and friends never reach here — the regex only lets a
    // scheme through when it is followed by `//`, and a bare word gets https.
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * "https://docs.google.com/spreadsheets/d/1a2b…" → "docs.google.com/spreadsheets/…".
 *
 * The host is what tells a person which link this is; the path rarely fits and
 * the scheme never helps. The full URL stays in the `title`, so the whole thing
 * is one hover away.
 */
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname === "/" ? "" : u.pathname;
    const shown = `${u.host}${tail}`;
    return shown.length > 42 ? `${shown.slice(0, 41)}…` : shown;
  } catch {
    return url.length > 42 ? `${url.slice(0, 41)}…` : url;
  }
}
