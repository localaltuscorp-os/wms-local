"use client";

import * as React from "react";
import { DEFAULT_DEBOUNCE_MS, useDebouncedCallback } from "@/lib/client/use-debounced";

/**
 * A drop-in replacement for `<input value={q} onChange={e => setQ(...)} />` in
 * a component that also renders an expensive list.
 *
 * The point is WHERE the per-keystroke state lives. Here it lives inside this
 * component, so a keypress re-renders one <input> and nothing else; the parent
 * (and the table under it) is told about the new text only after the user
 * pauses for `delay` ms. That is the difference between a keystroke costing a
 * few microseconds and costing a full table re-render.
 *
 * Every other input prop is forwarded, so callers keep their own chrome
 * (wrapper div, icon, classes) exactly as it was.
 */

export interface DebouncedSearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> {
  /**
   * Committed value. Only read when the PARENT changes it (e.g. a "Clear all"
   * button); it never fights what is being typed, because the parent's copy
   * only ever catches up to this input via `onChange`.
   */
  value?: string;
  /** Called with the new text, debounced. */
  onChange: (value: string) => void;
  /** Debounce window. Defaults to the project standard (300ms). */
  delay?: number;
}

export const DebouncedSearchInput = React.memo(function DebouncedSearchInput({
  value = "",
  onChange,
  delay = DEFAULT_DEBOUNCE_MS,
  onKeyDown,
  ...rest
}: DebouncedSearchInputProps) {
  const [text, setText] = React.useState(value);
  const commit = useDebouncedCallback(onChange, delay);

  // Adopt an externally-forced value (parent reset / "Clear all"). `lastSent`
  // is what we last handed the parent, so this only fires when the change came
  // from somewhere else — a parent echoing our own value back is ignored, which
  // is what keeps this from stuttering mid-word.
  const lastSent = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      commit.cancel();
      setText(value);
    }
  }, [value, commit]);

  const handle = (next: string) => {
    setText(next); // instant echo
    lastSent.current = next;
    commit(next); // expensive consumer, debounced
  };

  const handleNow = (next: string) => {
    setText(next);
    lastSent.current = next;
    commit.flush(next); // clearing should never wait out the delay
  };

  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => handle(e.target.value)}
      onKeyDown={(e) => {
        // Escape clears immediately — a debounced clear feels broken.
        if (e.key === "Escape" && text) handleNow("");
        onKeyDown?.(e);
      }}
    />
  );
});
