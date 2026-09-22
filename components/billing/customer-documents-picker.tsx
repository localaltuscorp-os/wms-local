"use client";

import * as React from "react";
import { Eye, FileText, ImagePlus, Plus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";

/**
 * Business-card front / back plus any other files, picked BEFORE the client is
 * saved. Nothing is uploaded here: the files wait in the browser and the KYC
 * form sends them once the save hands back the new client's id (an upload
 * needs a record to belong to). Images preview as thumbnails; anything else
 * shows its name.
 */

export type StagedDocs = {
  front: File | null;
  back: File | null;
  other: File[];
  brochure: File[];
  videos: File[];
};
export const emptyStagedDocs = (): StagedDocs => ({ front: null, back: null, other: [], brochure: [], videos: [] });

const MAX_BYTES = 25 * 1024 * 1024;
const BLOCKED = /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;

function accept(file: File): boolean {
  if (file.size === 0) {
    fireToast({ message: `${file.name} is empty.`, type: "error" });
    return false;
  }
  if (file.size > MAX_BYTES) {
    fireToast({ message: `${file.name} is over 25 MB.`, type: "error" });
    return false;
  }
  if (BLOCKED.test(file.name)) {
    fireToast({ message: `${file.name}: this file type is not allowed.`, type: "error" });
    return false;
  }
  return true;
}

export function CustomerDocumentsPicker({
  value,
  onChange,
}: {
  value: StagedDocs;
  onChange: (v: StagedDocs) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white"
          style={{ background: "#0F172A" }}
        >
          1
        </span>
        <span className="text-[13px] font-bold text-ink-strong">Business Card &amp; Documents</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <SingleTile
          label="Front"
          cta="Add front"
          file={value.front}
          onPick={(f) => onChange({ ...value, front: f })}
        />
        <SingleTile
          label="Back"
          cta="Add back"
          file={value.back}
          onPick={(f) => onChange({ ...value, back: f })}
        />
        <MultiTile
          label="Brochure"
          cta="Add brochure"
          accept=".pdf,image/*,.ppt,.pptx,.doc,.docx"
          files={value.brochure}
          onChange={(brochure) => onChange({ ...value, brochure })}
        />
        <MultiTile
          label="Videos"
          cta="Add videos"
          accept="video/*"
          files={value.videos}
          onChange={(videos) => onChange({ ...value, videos })}
        />
        <MultiTile
          label="Other"
          cta="Add files"
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip"
          files={value.other}
          onChange={(other) => onChange({ ...value, other })}
        />
      </div>
    </div>
  );
}

function MultiTile({
  label,
  cta,
  accept: acceptAttr,
  files,
  onChange,
}: {
  label: string;
  cta: string;
  accept: string;
  files: File[];
  onChange: (f: File[]) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-ink-strong">{label}</p>
      <div className="flex flex-wrap gap-3">
        {files.map((f, i) => (
          <Preview key={`${f.name}-${i}`} file={f} onRemove={() => onChange(files.filter((_, j) => j !== i))} />
        ))}
        <PickBox multiple accept={acceptAttr} onFiles={(picked) => onChange([...files, ...picked])}>
          <Plus size={18} />
          <span className="mt-1.5 text-[13px] font-bold">{cta}</span>
        </PickBox>
      </div>
    </div>
  );
}

function SingleTile({
  label,
  cta,
  file,
  onPick,
}: {
  label: string;
  cta: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-ink-strong">{label}</p>
      {file ? (
        <Preview file={file} onRemove={() => onPick(null)} />
      ) : (
        <PickBox accept="image/*,.pdf" onFiles={(files) => onPick(files[0] ?? null)}>
          <ImagePlus size={18} />
          <span className="mt-1.5 text-[13px] font-bold">{cta}</span>
        </PickBox>
      )}
    </div>
  );
}

function PickBox({
  accept: acceptAttr,
  multiple,
  onFiles,
  children,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="flex h-[150px] w-[150px] flex-col items-center justify-center rounded-[10px] border border-hairline bg-white text-ink-strong transition hover:border-[color:var(--color-ink-muted)]"
    >
      {children}
      <input
        ref={ref}
        type="file"
        hidden
        multiple={multiple}
        accept={acceptAttr}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter(accept);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </button>
  );
}

function Preview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  // The thumbnail no longer shares an object URL with View: that shared URL
  // was released by React's dev double-mount while still in use, which is
  // what made View open "file couldn't be accessed".
  const [thumb, setThumb] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!isImage) return;
    // A data URL via FileReader: nothing to release, so nothing to release early.
    const reader = new FileReader();
    reader.onload = () => setThumb(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file, isImage]);

  /** A fresh URL per click, released a minute later — never a stale one. */
  function view() {
    const u = URL.createObjectURL(file);
    window.open(u, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  }

  return (
    <div className="relative flex h-[150px] w-[150px] flex-col overflow-hidden rounded-[10px] border border-hairline bg-white">
      <div className="min-h-0 flex-1">
        {isImage && thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={thumb} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 text-center text-ink-muted">
            <FileText size={22} />
            <span className="line-clamp-3 break-all text-[11.5px] font-semibold">{file.name}</span>
          </div>
        )}
      </div>
      {/* VIEW opens the picked file in a new tab (before it is even uploaded);
          REMOVE takes it off this client. */}
      <div className="flex border-t border-hairline text-[11.5px] font-bold">
        <button
          type="button"
          onClick={view}
          className="flex flex-1 items-center justify-center gap-1 py-1.5 text-ink-strong hover:bg-[rgba(15,23,42,0.04)]"
        >
          <Eye size={12} /> View
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="flex flex-1 items-center justify-center gap-1 border-l border-hairline py-1.5 text-[#B91C1C] hover:bg-[rgba(185,28,28,0.05)]"
        >
          <X size={12} /> Remove
        </button>
      </div>
    </div>
  );
}
