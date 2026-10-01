"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import type { FiledFormRow } from "@/app/(app)/hr/record/person-files-types";

export function FormPreviewModal({ form, onClose }: { form: FiledFormRow; onClose: () => void }) {
  React.useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const groups = React.useMemo(() => {
    const grouped = new Map<string, FiledFormRow["responses"]>();
    for (const response of form.responses) {
      const key = response.group?.trim() || "Responses";
      grouped.set(key, [...(grouped.get(key) ?? []), response]);
    }
    return Array.from(grouped, ([name, responses]) => ({ name, responses }));
  }, [form.responses]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hr-form-preview-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h2 id="hr-form-preview-title" className="truncate text-[19px] font-black text-ink-strong">
              {form.formName}
            </h2>
            <p className="mt-1 text-[12.5px] font-medium text-ink-muted">
              {form.sectionLabel}
              {form.dateIso
                ? ` · ${form.status === "submitted" ? "Submitted" : "Last saved"} ${new Date(form.dateIso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`/api/hr/forms/${form.id}/pdf`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-2 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              <Download size={14} /> PDF
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close form preview"
              className="grid h-9 w-9 place-items-center rounded-lg border border-hairline-strong text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="rounded-xl border border-hairline bg-surface-soft px-5 py-10 text-center text-[13px] text-ink-muted">
              This form has no saved answers yet.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <section key={group.name}>
                  <h3 className="mb-2 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                    {group.name}
                  </h3>
                  <dl className="overflow-hidden rounded-xl border border-hairline bg-white">
                    {group.responses.map((response, index) => (
                      <div key={`${group.name}-${index}`} className="border-b border-hairline px-4 py-3 last:border-b-0">
                        <dt className="text-[12px] font-semibold text-ink-muted">{response.question}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-[13.5px] font-semibold text-ink-strong">
                          {response.answer || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
