"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

/**
 * Presentational file picker for Outstanding forms. Light-themed "click to
 * upload or drag & drop" dropzone matching the WMS look. The PARENT owns the
 * `File` and performs the upload after the entity is created — this component
 * only surfaces the selection.
 */
export function AttachmentField({
  file,
  onChange,
  required,
  label = "Attachment",
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  required?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: FileList | null) {
    const f = files?.[0] ?? null;
    onChange(f);
  }

  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {required && <span className="text-[#E10600] ml-0.5">*</span>}
      </label>

      {file ? (
        <div className="flex items-center gap-2 rounded-md border border-[#CBD5E1] bg-white px-3.5 py-2.5">
          <Paperclip size={16} className="shrink-0 text-[#64748B]" />
          <span className="flex-1 truncate text-[15px] text-[#0F172A]">{file.name}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label="Remove file"
            className="shrink-0 rounded p-1 text-[#64748B] hover:text-[#A80400]"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3.5 py-6 text-center transition-colors ${
            dragging
              ? "border-[#E10600] bg-[#FEF2F2]"
              : "border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#94A3B8]"
          }`}
        >
          <Paperclip size={18} className="text-[#94A3B8]" />
          <span className="text-[14px] font-medium text-[#0F172A]">
            Click to upload or drag &amp; drop
          </span>
          <span className="text-[13px] text-[#64748B]">Max 25 MB</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  );
}
