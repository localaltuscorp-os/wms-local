"use client";

import * as React from "react";
import { LayoutPanelTop } from "lucide-react";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";

type SavedLayout = { order: string[] };
const keyFor = (pathname: string) => `altus:layout-arrangement:${pathname}`;
const clipboardKey = "altus:layout-arrangement:clipboard";

/** Temporary, admin-only layout mode. It deliberately handles only direct,
 * high-level regions in a PageShell; controls, form fields and data rows are
 * never made draggable. */
export function PageLayoutArranger({ canArrange }: { canArrange: boolean }) {
  const pathname = usePathname() ?? "/";
  const [editing, setEditing] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const dragId = React.useRef<string | null>(null);

  const regions = React.useCallback(() => {
    const surface = document.querySelector<HTMLElement>("[data-layout-surface='dashboard']")
      ?? document.querySelector<HTMLElement>("[data-layout-surface]");
    if (!surface) return [] as HTMLElement[];
    return Array.from(surface.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element.dataset.layoutIgnore !== "true");
  }, []);

  const idFor = React.useCallback((element: HTMLElement, index: number) => {
    return element.dataset.layoutRegion ?? `${element.tagName.toLowerCase()}-${index}`;
  }, []);

  const apply = React.useCallback((layout: SavedLayout | null) => {
    if (!layout) return;
    const surface = document.querySelector<HTMLElement>("[data-layout-surface='dashboard']")
      ?? document.querySelector<HTMLElement>("[data-layout-surface]");
    if (layout && surface) {
      surface.style.display = "flex";
      surface.style.flexDirection = "column";
    }
    const blocks = regions();
    blocks.forEach((block, index) => {
      const id = idFor(block, index);
      const order = layout?.order.indexOf(id);
      block.style.order = order != null && order >= 0 ? String(order) : "";
    });
  }, [idFor, regions]);

  React.useEffect(() => {
    if (!editing) return;
    try { apply(JSON.parse(localStorage.getItem(keyFor(pathname)) ?? "null") as SavedLayout | null); } catch { /* invalid local draft: start clean */ }
    const surface = document.querySelector<HTMLElement>("[data-layout-surface='dashboard']")
      ?? document.querySelector<HTMLElement>("[data-layout-surface]");
    if (!surface) return;
    surface.dataset.layoutEditing = "true";
    surface.style.display = "flex";
    surface.style.flexDirection = "column";
    const blocks = regions();
    const cleanups = blocks.map((block, index) => {
      const id = idFor(block, index);
      block.draggable = true;
      block.classList.add("relative", "cursor-grab", "outline", "outline-2", "outline-dashed", "outline-altus-red/50");
      const handle = document.createElement("span");
      handle.dataset.layoutIgnore = "true";
      handle.className = "absolute -left-2 top-3 z-20 inline-flex size-6 items-center justify-center rounded-full bg-altus-red text-white shadow";
      handle.setAttribute("aria-label", "Drag page region");
      handle.innerHTML = "⋮⋮";
      block.prepend(handle);
      const start = (event: DragEvent) => { dragId.current = id; event.dataTransfer?.setData("text/plain", id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; };
      const over = (event: DragEvent) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; };
      const drop = (event: DragEvent) => {
        event.preventDefault();
        const from = dragId.current;
        if (!from || from === id) return;
        const all = regions();
        const dragged = all.find((item, itemIndex) => idFor(item, itemIndex) === from);
        if (!dragged) return;
        const fromOrder = Number(dragged.style.order || all.indexOf(dragged));
        const toOrder = Number(block.style.order || all.indexOf(block));
        all.forEach((item, itemIndex) => {
          const current = Number(item.style.order || itemIndex);
          if (item === dragged) item.style.order = String(toOrder);
          else if (fromOrder < toOrder && current > fromOrder && current <= toOrder) item.style.order = String(current - 1);
          else if (fromOrder > toOrder && current >= toOrder && current < fromOrder) item.style.order = String(current + 1);
        });
      };
      const context = (event: MouseEvent) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
      };
      block.addEventListener("dragstart", start);
      block.addEventListener("dragover", over);
      block.addEventListener("drop", drop);
      block.addEventListener("contextmenu", context);
      return () => { block.draggable = false; block.classList.remove("relative", "cursor-grab", "outline", "outline-2", "outline-dashed", "outline-altus-red/50"); handle.remove(); block.removeEventListener("dragstart", start); block.removeEventListener("dragover", over); block.removeEventListener("drop", drop); block.removeEventListener("contextmenu", context); };
    });
    return () => { delete surface.dataset.layoutEditing; cleanups.forEach((cleanup) => cleanup()); };
  }, [apply, editing, idFor, pathname, regions]);

  if (!canArrange || !workspaceForPath(pathname)) return null;
  const save = () => { const order = regions().slice().sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0)).map((item, index) => idFor(item, index)); localStorage.setItem(keyFor(pathname), JSON.stringify({ order })); window.dispatchEvent(new Event("altus:save-arrange-ui")); setMessage("Arrangement saved for this page in this browser."); };
  const paste = () => { try { const layout = JSON.parse(localStorage.getItem(clipboardKey) ?? "null") as SavedLayout | null; if (!layout) return setMessage("Copy a layout first."); apply(layout); setMessage("Copied layout applied. Save it for this page."); } catch { setMessage("Could not read the copied layout."); } };
  const copy = () => { const order = regions().slice().sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0)).map((item, index) => idFor(item, index)); localStorage.setItem(clipboardKey, JSON.stringify({ order })); setContextMenu(null); setMessage("Layout copied. Open another page and use Paste layout."); };
  const toggleEditing = () => {
    const next = !editing;
    setEditing(next);
    window.dispatchEvent(new CustomEvent("altus:arrange-ui", { detail: { editing: next } }));
    setMessage(null);
    setContextMenu(null);
  };

  return <><div className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-xl border border-hairline bg-white p-2 shadow-xl"><button type="button" onClick={toggleEditing} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${editing ? "bg-altus-red text-white" : "text-ink-strong hover:bg-surface-soft"}`}><LayoutPanelTop size={16} />{editing ? "Finish arranging" : "Arrange UI"}</button>{editing && <><button type="button" onClick={save} className="rounded-lg px-3 py-2 text-sm font-bold text-ink-strong hover:bg-surface-soft">Save</button><button type="button" onClick={paste} className="rounded-lg px-3 py-2 text-sm font-bold text-ink-strong hover:bg-surface-soft">Paste layout</button></>}{message && <span className="max-w-48 text-xs font-semibold text-ink-muted">{message}</span>}</div>{contextMenu && <div className="fixed z-[100] rounded-lg border border-hairline bg-white p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }}><button type="button" onClick={copy} className="rounded-md px-3 py-2 text-left text-sm font-bold text-ink-strong hover:bg-surface-soft">Copy layout/style</button></div>}</>;
}
