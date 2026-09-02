"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
  Check,
  X,
  Loader2,
  FolderPlus,
  ChevronUp,
  ChevronDown,
  Search,
  AlertTriangle,
} from "lucide-react";
import { HoverTip } from "@/components/ui/hover-tip";
import type { IndexSectionView } from "@/lib/queries/index-hub";
import {
  addIndexSection,
  renameIndexSection,
  deleteIndexSection,
  addIndexLink,
  editIndexLink,
  deleteIndexLink,
  reorderIndexSections,
} from "@/app/(app)/index-hub/actions";

interface Props {
  sections: IndexSectionView[];
  isAdmin: boolean;
  /** Deleting a file or a whole section is Manan Vasa's call alone. */
  canDelete: boolean;
}

/** The sticky app header eats the top ~80px — offset "jump to section" scrolls. */
const SCROLL_MARGIN_TOP = 92;

const sectionAnchor = (id: string) => `index-section-${id}`;

export function IndexHubBoard({ sections, isAdmin, canDelete }: Props) {
  const reorderRouter = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [addingSection, setAddingSection] = React.useState(false);
  const [query, setQuery] = React.useState("");

  function moveSection(index: number, dir: -1 | 1) {
    const next = [...sections];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    const orderedIds = next.map((s) => s.id);
    void reorderIndexSections(orderedIds).then(() => reorderRouter.refresh());
  }

  /* Filter — matches a section by its own name (keeps every file inside it) or
     by the file names within it (keeps only the matching files). Carries the
     ORIGINAL index so the reorder arrows still move the right section. */
  const q = query.trim().toLowerCase();
  const visible = React.useMemo(() => {
    const all = sections.map((section, index) => ({ section, index }));
    if (!q) return all;
    return all.flatMap(({ section, index }) => {
      if (section.title.toLowerCase().includes(q)) return [{ section, index }];
      const links = section.links.filter((l) => l.label.toLowerCase().includes(q));
      return links.length ? [{ section: { ...section, links }, index }] : [];
    });
  }, [sections, q]);

  function jumpTo(id: string) {
    document.getElementById(sectionAnchor(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="mx-auto max-w-[1400px] px-12 max-md:px-4 pt-8 pb-24">
      {/* Header ------------------------------------------------------- */}
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(36px, 3.8vw, 52px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Index
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 17 }}>
            Every sheet, folder and tool in the Altus Corp ecosystem — one click away.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAddingSection((v) => !v)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold text-ink-strong transition-all active:scale-[0.98] hover:border-altus-red/40"
              style={{
                border: "1px solid var(--color-hairline)",
                background: "var(--color-surface-card)",
              }}
            >
              <FolderPlus size={16} strokeWidth={2.4} />
              Section
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold transition-all active:scale-[0.98]"
              style={
                editing
                  ? {
                      background:
                        "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      color: "#fff",
                      boxShadow: "0 6px 18px -6px rgba(225, 6, 0, 0.55)",
                    }
                  : { border: "1px solid var(--color-hairline)", background: "var(--color-surface-card)" }
              }
            >
              {editing ? <Check size={16} strokeWidth={2.4} /> : <Pencil size={16} strokeWidth={2.4} />}
              {editing ? "Done Editing" : "Edit"}
            </button>
          </div>
        )}
      </header>

      {/* Top-right "Section" opens the add-section panel right here ---- */}
      {isAdmin && addingSection && <AddSection onDone={() => setAddingSection(false)} />}

      {/* Filter + jump-to-section ------------------------------------- */}
      {sections.length > 0 && (
        <div className="mb-6 rounded-section border border-hairline bg-surface-card p-3.5">
          <div className="flex items-center gap-2.5">
            <Search size={16} className="shrink-0 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter sections and documents…"
              className="min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold text-ink-strong outline-none placeholder:font-medium placeholder:text-ink-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                title="Clear filter"
                className="rounded-full p-1 text-ink-muted transition-colors hover:bg-black/[0.06] hover:text-ink-strong"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-3">
            <span className="mr-1 text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              Jump to
            </span>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                className="rounded-full border border-hairline bg-white px-3 py-1 text-[12.5px] font-bold text-ink-strong transition-all hover:border-altus-red/40 hover:text-altus-red"
              >
                {s.title}
                <span className="ml-1.5 text-ink-muted tabular-nums">{s.links.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sections.length === 0 && !editing ? (
        <div className="rounded-section border border-hairline bg-surface-card p-10 text-center">
          <p className="font-bold text-[20px] text-ink-strong">Nothing here yet.</p>
          {isAdmin && (
            <p className="mt-2 font-semibold text-[15px] text-ink-muted">
              Click <strong>Section</strong> to add your first section.
            </p>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-section border border-hairline bg-surface-card p-10 text-center">
          <p className="font-bold text-[18px] text-ink-strong">
            Nothing matches “{query.trim()}”.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 text-[14px] font-bold text-altus-red hover:underline"
          >
            Clear the filter
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {visible.map(({ section, index }) => (
            <SectionCard
              key={section.id}
              section={section}
              editing={editing}
              canDelete={canDelete}
              index={index}
              total={sections.length}
              reorderable={!q}
              onMove={moveSection}
            />
          ))}
        </div>
      )}

      {editing && <AddSection />}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

function SectionCard({
  section,
  editing,
  canDelete,
  index,
  total,
  reorderable,
  onMove,
}: {
  section: IndexSectionView;
  editing: boolean;
  canDelete: boolean;
  index: number;
  total: number;
  reorderable: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [title, setTitle] = React.useState(section.title);
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => setTitle(section.title), [section.title]);

  function saveTitle() {
    if (title.trim() === section.title || !title.trim()) {
      setTitle(section.title);
      return;
    }
    start(async () => {
      await renameIndexSection({ id: section.id, title: title.trim() });
      router.refresh();
    });
  }

  function removeSection() {
    start(async () => {
      await deleteIndexSection({ id: section.id });
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <section
      id={sectionAnchor(section.id)}
      className="rounded-section border border-hairline bg-surface-card p-6"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)", scrollMarginTop: SCROLL_MARGIN_TOP }}
    >
      <div className="mb-4 flex items-center gap-3">
        {editing && reorderable && (
          <span className="inline-flex flex-col -my-1">
            <button type="button" aria-label="Move section up" disabled={index === 0}
              onClick={() => onMove(index, -1)}
              className="rounded p-0.5 text-ink-muted hover:bg-black/[0.06] hover:text-ink-strong disabled:opacity-30">
              <ChevronUp size={15} />
            </button>
            <button type="button" aria-label="Move section down" disabled={index === total - 1}
              onClick={() => onMove(index, 1)}
              className="rounded p-0.5 text-ink-muted hover:bg-black/[0.06] hover:text-ink-strong disabled:opacity-30">
              <ChevronDown size={15} />
            </button>
          </span>
        )}
        <span
          aria-hidden
          className="inline-block h-6 w-1.5 rounded-full"
          style={{
            background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))",
          }}
        />
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="flex-1 rounded-md border border-hairline bg-white px-3 py-1.5 text-[19px] font-black text-ink-strong outline-none focus:border-altus-red/50"
          />
        ) : (
          <h2 className="flex-1 font-black text-ink-strong text-[21px]">{section.title}</h2>
        )}
        <span className="text-[13px] font-bold text-ink-muted tabular-nums">
          {section.links.length}
        </span>
        {editing && canDelete && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            title="Delete section"
            className="rounded-md p-1.5 text-ink-muted hover:bg-red-50 hover:text-altus-red transition-colors"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        )}
      </div>

      {/* Documents — a fixed 4/5-up grid so every box is the same size and the
          names line up column-wise. Long names clamp; hover reads the full one. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {section.links.map((l) => (
          <LinkButton key={l.id} link={l} editing={editing} canDelete={canDelete} />
        ))}
      </div>
      {section.links.length === 0 && !editing && (
        <span className="text-[14px] font-semibold text-ink-muted">No links yet.</span>
      )}

      {editing && <AddLink sectionId={section.id} />}

      <ConfirmDeleteDialog
        open={confirming}
        detail={`“${section.title}” — this section and all ${section.links.length} document(s) inside it.`}
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={removeSection}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Link button                                                         */
/* ------------------------------------------------------------------ */

function LinkButton({
  link,
  editing,
  canDelete,
}: {
  link: IndexSectionView["links"][number];
  editing: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [label, setLabel] = React.useState(link.label);
  const [url, setUrl] = React.useState(link.url);

  function remove() {
    start(async () => {
      await deleteIndexLink({ id: link.id });
      setConfirming(false);
      router.refresh();
    });
  }

  function save() {
    if (!label.trim() || !url.trim()) return;
    start(async () => {
      await editIndexLink({ id: link.id, label: label.trim(), url: url.trim() });
      setOpen(false);
      router.refresh();
    });
  }

  if (editing && open) {
    return (
      <div className="col-span-full flex w-full items-center gap-2 rounded-xl border border-hairline bg-black/[0.02] p-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Document name"
          className="w-56 rounded-md border border-hairline bg-white px-2 py-1.5 text-[13.5px] font-semibold outline-none focus:border-altus-red/50"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="min-w-0 flex-1 rounded-md border border-hairline bg-white px-2 py-1.5 text-[13px] font-medium outline-none focus:border-altus-red/50"
        />
        <button type="button" onClick={save} disabled={pending} className="rounded-md p-1.5 text-green-600 hover:bg-green-50" title="Save">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-ink-muted hover:bg-black/[0.05]" title="Cancel">
          <X size={15} />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex h-[62px] items-center gap-1 rounded-xl border border-hairline bg-white px-3 text-[13px] font-bold text-ink-strong">
        <span className="min-w-0 flex-1">
          <HoverTip text={link.label}>
            <span className="block line-clamp-2 leading-[1.25]">{link.label}</span>
          </HoverTip>
        </span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-black/[0.06] hover:text-ink-strong" title="Edit link">
          <Pencil size={13} />
        </button>
        {canDelete && (
          <button type="button" onClick={() => setConfirming(true)} disabled={pending} className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-red-50 hover:text-altus-red" title="Remove">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}
        <ConfirmDeleteDialog
          open={confirming}
          detail={`“${link.label}”`}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
        />
      </div>
    );
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="group flex h-[62px] items-center gap-2 rounded-xl border border-hairline bg-white px-3.5 text-[13px] font-bold text-ink-strong transition-all hover:border-altus-red/40 hover:shadow-sm hover:-translate-y-px"
    >
      <span className="min-w-0 flex-1">
        <HoverTip text={link.label}>
          <span className="block line-clamp-2 leading-[1.25]">{link.label}</span>
        </HoverTip>
      </span>
      <ExternalLink size={14} className="shrink-0 text-ink-muted group-hover:text-altus-red transition-colors" />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Delete confirmation                                                 */
/* ------------------------------------------------------------------ */

/** In-app confirm — replaces the native `confirm()` so the copy is ours and the
 *  destructive button is unmistakable. Deleting is irreversible. */
function ConfirmDeleteDialog({
  open,
  detail,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  detail: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl border border-hairline bg-white p-6 text-left"
        style={{ boxShadow: "0 24px 60px -18px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(225,6,0,0.10)", color: "var(--color-altus-red)" }}
          >
            <AlertTriangle size={18} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="text-[16.5px] font-black leading-snug text-ink-strong">
              Are you sure you want to delete this file or this section?
            </p>
            <p className="mt-1.5 break-words text-[13.5px] font-semibold text-ink-muted">{detail}</p>
            <p className="mt-1 text-[13px] font-semibold text-ink-muted">This cannot be undone.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-full border border-hairline bg-white px-4 py-2 text-[13.5px] font-bold text-ink-strong transition-colors hover:bg-black/[0.04] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            }}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add link / Add section                                              */
/* ------------------------------------------------------------------ */

function AddLink({ sectionId }: { sectionId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    if (!label.trim() || !url.trim()) {
      setError("Add both a button name and a link.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await addIndexLink({ sectionId, label: label.trim(), url: url.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLabel("");
      setUrl("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-solid border-hairline p-2.5">
      <Plus size={15} className="text-ink-muted" />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Button name"
        className="w-44 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13.5px] font-semibold outline-none focus:border-altus-red/50"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="https://link…"
        className="min-w-[220px] flex-1 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-altus-red/50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Add Button
      </button>
      {error && <span className="w-full text-[12.5px] font-semibold text-altus-red">{error}</span>}
    </div>
  );
}

function AddSection({ onDone }: { onDone?: () => void } = {}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    if (!title.trim()) {
      setError("Give the section a name.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await addIndexSection({ title: title.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 rounded-section border border-solid border-hairline bg-surface-card p-4">
      <FolderPlus size={18} className="text-altus-red" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="New section name"
        autoFocus={!!onDone}
        className="min-w-[220px] flex-1 rounded-md border border-hairline bg-white px-3 py-2 text-[15px] font-bold outline-none focus:border-altus-red/50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        Add Section
      </button>
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-hairline bg-white px-4 py-2 text-[13.5px] font-bold text-ink-strong transition-colors hover:bg-black/[0.04]"
        >
          Cancel
        </button>
      )}
      {error && <span className="w-full text-[13px] font-semibold text-altus-red">{error}</span>}
    </div>
  );
}
