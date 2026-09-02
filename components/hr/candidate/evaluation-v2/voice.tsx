"use client";

import * as React from "react";
import { Mic, MessageSquarePlus, ChevronDown } from "lucide-react";
import { useDictation } from "./use-dictation";

const RED = "var(--color-altus-red)";

/** A compact mic toggle that hides itself when dictation is unsupported. */
export function MicButton({
  recording,
  supported,
  onToggle,
  size = "md",
}: {
  recording: boolean;
  supported: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
}) {
  if (!supported) return null;
  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={recording}
      title={recording ? "Stop dictation" : "Dictate with your voice"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill font-bold transition-colors ${sm ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]"}`}
      style={
        recording
          ? { background: RED, color: "#fff" }
          : { background: "#fff", color: "var(--color-ink-strong)", border: "1px solid var(--color-hairline-strong)" }
      }
    >
      {recording ? (
        <>
          <span className="ev2-rec-dot grid h-3.5 w-3.5 place-items-center rounded-full bg-white/95">
            <span className="block h-[6px] w-[6px] rounded-[2px]" style={{ background: RED }} />
          </span>
          Stop
        </>
      ) : (
        <>
          <Mic size={sm ? 13 : 15} strokeWidth={2.3} /> Dictate
        </>
      )}
    </button>
  );
}

/**
 * A labelled textarea with a voice-dictation button — used for the closing
 * text boxes (Justification, Strengths, …) and the eligibility Exceptions.
 */
export function VoiceTextbox({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  minHeight = 96,
  accent,
  hint,
  id: idProp,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  minHeight?: number;
  /** Optional accent tone for the label + focus ring (defaults to Altus red). */
  accent?: string;
  hint?: string;
  id?: string;
}) {
  const reactId = React.useId();
  const id = idProp ?? reactId;
  const dict = useDictation({ value, onChange });
  const ring = accent ?? RED;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13.5px] font-bold text-ink-strong">
          {label}
        </label>
        <MicButton recording={dict.recording} supported={dict.supported} onToggle={dict.toggle} size="sm" />
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Type here, or press Dictate to capture by voice…"}
        rows={rows}
        maxLength={8000}
        className="w-full rounded-[14px] border-2 px-3.5 py-3 text-[14.5px] leading-relaxed text-ink-strong outline-none transition-[border-color,box-shadow]"
        style={{
          minHeight,
          resize: "vertical",
          borderColor: "color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))",
          // focus styling handled inline for the accent
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = ring;
          e.currentTarget.style.boxShadow = `0 0 0 4px color-mix(in srgb, ${ring} 13%, transparent)`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      {dict.recording ? (
        <p className="mt-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-altus-red">
          <span className="ev2-rec-dot inline-block h-2 w-2 rounded-full" style={{ background: RED }} />
          Listening…{dict.interim && <span className="font-normal italic text-ink-muted">“{dict.interim}”</span>}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A collapsible per-row note with dictation. Shows a small "Add note" toggle;
 * a filled note stays visible as a subtle summary line and keeps the box open.
 */
export function RowNotes({
  value,
  onChange,
  label = "Notes",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const id = React.useId();
  const hasNote = value.trim().length > 0;
  const [open, setOpen] = React.useState(hasNote);
  const dict = useDictation({ value, onChange });

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-subtle transition-colors hover:text-altus-red"
      >
        <MessageSquarePlus size={13} />
        {hasNote ? "Note" : label}
        <ChevronDown size={12} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        {hasNote && !open && <span className="ml-1 max-w-[220px] truncate font-medium text-ink-muted">— {value.trim()}</span>}
      </button>

      {open && (
        <div id={id} className="ev2-collapse mt-2">
          <div className="mb-1.5 flex justify-end">
            <MicButton recording={dict.recording} supported={dict.supported} onToggle={dict.toggle} size="sm" />
          </div>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Add a note for this line…"
            rows={2}
            maxLength={4000}
            className="w-full rounded-xl border px-3 py-2 text-[13.5px] leading-relaxed text-ink-strong outline-none transition-colors focus:border-altus-red"
            style={{ resize: "vertical", borderColor: "var(--color-hairline-strong)" }}
          />
          {dict.recording && (
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-altus-red">
              <span className="ev2-rec-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: RED }} />
              Listening…{dict.interim && <span className="font-normal italic text-ink-muted">“{dict.interim}”</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
