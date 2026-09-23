"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload, X } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { fireToast } from "@/lib/toast";
import type { TemplateMasterRow } from "@/lib/queries/template-files";
import { deleteTemplates, uploadTemplate } from "@/app/(admin)/admin/upload-master/actions";
import { formatDate } from "@/lib/format";

/**
 * THE UPLOAD MASTER LIST.
 *
 * One row per bulk-import template, and one row per FEATURE — every bulk upload
 * in the application is on this list, because the list IS the registry
 * (lib/templates/registry.ts). Columns: Template, Module, Current file, Last
 * edited, Download, Delete, Replace — inline buttons, no kebab menu.
 * Multi-select (the shared <DataTable> checkbox column) powers "Download
 * selected" and "Delete selected".
 *
 * "Delete" reverts a template to its built-in; it is disabled for a template
 * nobody has replaced, because there is always a built-in behind every row — a
 * template cannot be truly deleted, and pretending otherwise would break the
 * module that depends on it.
 */

function formatEdited(r: TemplateMasterRow): string {
  if (!r.lastEdited) return "Built-in — never edited";
  const d = typeof r.lastEdited === "string" ? new Date(r.lastEdited) : r.lastEdited;
  return formatDate(d);
}

const actionBtn =
  "rounded-lg border border-hairline-strong px-2.5 py-1 text-[12px] font-semibold text-ink-muted hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-40";

export function UploadMasterTable({
  rows,
  canEdit,
}: {
  rows: TemplateMasterRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editingKey, setEditingKey] = React.useState<string | null>(null);

  async function remove(key: string) {
    const res = await deleteTemplates([key]);
    if (!res.ok) {
      fireToast({ message: res.error });
      return;
    }
    fireToast({ message: "Template reverted to built-in." });
    router.refresh();
  }

  function confirmRemove(row: TemplateMasterRow) {
    if (!window.confirm(`Revert “${row.name}” to its built-in template?`)) return;
    void remove(row.key);
  }

  return (
    <>
      <DataTable<TemplateMasterRow>
        rows={rows}
        getRowKey={(r) => r.key}
        initialSort={{ key: "module", dir: "asc" }}
        bulkActions={
          canEdit
            ? (selected, clearSelection) => (
                <BulkActions rows={selected} onDone={clearSelection} />
              )
            : undefined
        }
        columns={[
          {
            key: "name",
            label: "Template",
            sortValue: (r) => r.name,
            render: (r) => (
              <span className="font-semibold text-ink-strong">{r.name}</span>
            ),
          },
          {
            key: "module",
            label: "Module",
            sortValue: (r) => r.module,
            render: (r) => (
              <span className="text-ink-soft">
                {r.module}
                <span className="block text-[12px] text-ink-subtle">{r.feature}</span>
              </span>
            ),
          },
          {
            key: "fileName",
            label: "Current file",
            sortValue: (r) => r.fileName,
            render: (r) => (
              <span className={r.overridden ? "text-ink-soft" : "text-ink-subtle"}>
                {r.fileName}
                <span className="block text-[12px] text-ink-subtle">
                  {r.overridden ? "Replaced by an admin" : "Built-in"}
                </span>
              </span>
            ),
          },
          {
            key: "lastEdited",
            label: "Last edited",
            sortValue: (r) => (r.lastEdited ? String(r.lastEdited) : ""),
            render: (r) => (
              <span className={r.overridden ? "text-ink-soft" : "text-ink-subtle"}>
                {formatEdited(r)}
              </span>
            ),
          },
          {
            key: "download",
            label: "Download",
            render: (r) => (
              <a
                href={`/admin/upload-master/download/${r.key}`}
                className={`${actionBtn} inline-flex items-center gap-1`}
              >
                <Download size={13} strokeWidth={2.4} />
                Download
              </a>
            ),
          },
          {
            key: "delete",
            label: "Delete",
            render: (r) => (
              <button
                type="button"
                className={actionBtn}
                disabled={!canEdit || !r.overridden}
                title={!r.overridden ? "Nothing to delete — this template is built-in" : undefined}
                onClick={() => confirmRemove(r)}
              >
                Delete
              </button>
            ),
          },
          {
            key: "edit",
            label: "Edit",
            render: (r) => (
              <button
                type="button"
                className={`${actionBtn} inline-flex items-center gap-1`}
                disabled={!canEdit}
                onClick={() => setEditingKey(r.key)}
              >
                <Upload size={13} strokeWidth={2.4} />
                Replace
              </button>
            ),
          },
        ]}
        emptyState={
          <div className="px-4 py-10 text-center text-[13px] text-ink-muted">
            No templates.
          </div>
        }
        dense
      />

      {editingKey && (
        <ReplaceDialog key={editingKey} templateKey={editingKey} onClose={() => setEditingKey(null)} />
      )}
    </>
  );
}

/* ── Bulk ─────────────────────────────────────────────────────────────────── */

function BulkActions({
  rows,
  onDone,
}: {
  rows: TemplateMasterRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  function downloadAll() {
    // One file per selected row, triggered in sequence. The anchors are attached
    // to the document before the click — a detached anchor is ignored by some
    // browsers, which is how a "download" button silently does nothing.
    for (const r of rows) {
      const a = document.createElement("a");
      a.href = `/admin/upload-master/download/${r.key}`;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  async function removeAll() {
    const targets = rows.filter((r) => r.overridden);
    if (targets.length === 0) {
      fireToast({ message: "Selected templates are already built-in." });
      return;
    }
    if (!window.confirm(`Revert ${targets.length} template${targets.length === 1 ? "" : "s"} to built-in?`)) return;
    setBusy(true);
    const res = await deleteTemplates(targets.map((r) => r.key));
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error });
      return;
    }
    fireToast({ message: `${res.deleted} template${res.deleted === 1 ? "" : "s"} reverted.` });
    onDone();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={downloadAll}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong disabled:opacity-50"
      >
        <Download size={13} strokeWidth={2.4} />
        Download selected
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={removeAll}
        className="rounded-lg border border-hairline-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong disabled:opacity-50"
      >
        Delete selected
      </button>
    </>
  );
}

/* ── Replace ──────────────────────────────────────────────────────────────── */

function ReplaceDialog({
  templateKey,
  onClose,
}: {
  templateKey: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("key", templateKey);
    fd.set("file", file);
    const res = await uploadTemplate(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Template replaced. It now serves sitewide." });
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Replace template"
    >
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface-card p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-bold text-ink-strong">Replace template</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              Upload a new .xlsx. It replaces the current file everywhere it is downloaded.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-subtle hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-[13px] text-ink-soft file:mr-3 file:rounded-pill file:border-0 file:bg-surface-soft file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-ink-strong hover:file:bg-surface-soft"
        />

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border px-3 py-2 text-[13.5px]"
            style={{
              borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
              background: "var(--color-altus-red-wash)",
              color: "var(--color-altus-red-deep)",
            }}
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft hover:border-hairline-strong hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!file || busy}
            className="pastel-cta wg-btn inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Uploading…" : "Replace template"}
          </button>
        </div>
      </div>
    </div>
  );
}
