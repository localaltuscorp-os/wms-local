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
} from "lucide-react";
import type { IndexSectionView } from "@/lib/queries/index-hub";
import {
  addIndexSection,
  renameIndexSection,
  deleteIndexSection,
  addIndexLink,
  editIndexLink,
  deleteIndexLink,
  reorderIndexSections,
} from "@/app/(app)/index/actions";

interface Props {
  sections: IndexSectionView[];
  isAdmin: boolean;
}

export function IndexHubBoard({ sections, isAdmin }: Props) {
  const reorderRouter = useRouter();
  function moveSection(index: number, dir: -1 | 1) {
    const next = [...sections];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    const orderedIds = next.map((s) => s.id);
    void reorderIndexSections(orderedIds).then(() => reorderRouter.refresh());
  }
  const [editing, setEditing] = React.useState(false);

  return (
    <main className="mx-auto max-w-[1400px] px-12 max-md:px-4 pt-8 pb-24">
      {/* Header ------------------------------------------------------- */}
      <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
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
            {editing ? "Done editing" : "Edit"}
          </button>
        )}
      </header>

      {sections.length === 0 && !editing ? (
        <div className="rounded-section border border-hairline bg-surface-card p-10 text-center">
          <p className="font-bold text-[20px] text-ink-strong">Nothing here yet.</p>
          {isAdmin && (
            <p className="mt-2 font-semibold text-[15px] text-ink-muted">
              Click <strong>Edit</strong> to add your first section.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((s, i) => (
            <SectionCard
              key={s.id}
              section={s}
              editing={editing}
              index={i}
              total={sections.length}
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
  index,
  total,
  onMove,
}: {
  section: IndexSectionView;
  editing: boolean;
  index: number;
  total: number;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [title, setTitle] = React.useState(section.title);
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
    if (
      !confirm(
        `Delete the "${section.title}" section and all ${section.links.length} button(s) inside it? This cannot be undone.`,
      )
    )
      return;
    start(async () => {
      await deleteIndexSection({ id: section.id });
      router.refresh();
    });
  }

  return (
    <section
      className="rounded-section border border-hairline bg-surface-card p-6"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="mb-4 flex items-center gap-3">
        {editing && (
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
        {editing && (
          <button
            type="button"
            onClick={removeSection}
            disabled={pending}
            title="Delete section"
            className="rounded-md p-1.5 text-ink-muted hover:bg-red-50 hover:text-altus-red transition-colors"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {section.links.map((l) => (
          <LinkButton key={l.id} link={l} editing={editing} />
        ))}
        {section.links.length === 0 && !editing && (
          <span className="text-[14px] font-semibold text-ink-muted">No links yet.</span>
        )}
      </div>

      {editing && <AddLink sectionId={section.id} />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Link button                                                         */
/* ------------------------------------------------------------------ */

function LinkButton({ link, editing }: { link: IndexSectionView["links"][number]; editing: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(link.label);
  const [url, setUrl] = React.useState(link.url);

  function remove() {
    if (!confirm(`Remove the "${link.label}" button?`)) return;
    start(async () => {
      await deleteIndexLink({ id: link.id });
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
      <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-hairline bg-black/[0.02] p-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Button name"
          className="w-40 rounded-md border border-hairline bg-white px-2 py-1.5 text-[13.5px] font-semibold outline-none focus:border-altus-red/50"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="flex-1 rounded-md border border-hairline bg-white px-2 py-1.5 text-[13px] font-medium outline-none focus:border-altus-red/50"
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
      <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-white pl-3.5 pr-1.5 py-1.5 text-[13.5px] font-bold text-ink-strong">
        {link.label}
        <button type="button" onClick={() => setOpen(true)} className="rounded-full p-1 text-ink-muted hover:bg-black/[0.06] hover:text-ink-strong" title="Edit link">
          <Pencil size={13} />
        </button>
        <button type="button" onClick={remove} disabled={pending} className="rounded-full p-1 text-ink-muted hover:bg-red-50 hover:text-altus-red" title="Remove">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </span>
    );
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-2 rounded-full border border-hairline bg-white px-4 py-2 text-[13.5px] font-bold text-ink-strong transition-all hover:border-altus-red/40 hover:shadow-sm hover:-translate-y-px"
    >
      {link.label}
      <ExternalLink size={14} className="text-ink-muted group-hover:text-altus-red transition-colors" />
    </a>
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
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-hairline p-2.5">
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
        Add button
      </button>
      {error && <span className="w-full text-[12.5px] font-semibold text-altus-red">{error}</span>}
    </div>
  );
}

function AddSection() {
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
      router.refresh();
    });
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 rounded-section border border-dashed border-hairline bg-surface-card p-4">
      <FolderPlus size={18} className="text-altus-red" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="New section name"
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
        Add section
      </button>
      {error && <span className="w-full text-[13px] font-semibold text-altus-red">{error}</span>}
    </div>
  );
}
