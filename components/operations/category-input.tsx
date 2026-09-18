"use client";

import * as React from "react";

/**
 * The categories already in use, once each, A–Z.
 *
 * Case-insensitive, first spelling wins — so the suggestions offer
 * "Housekeeping" once even if somebody has also typed "housekeeping".
 */
export function distinctCategories(rows: readonly { category: string | null }[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const c = r.category?.trim();
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * A CATEGORY — free text, with the ones already in use offered as suggestions.
 *
 * Free text because the account holder asked for a column the author can simply
 * write in (Housekeeping, Internet, Vendors) and the set is not known up front.
 * The suggestions are what keep one word from being spelled three ways, and a
 * typed match is snapped to the existing spelling for the same reason.
 *
 * Commits on blur or Enter; Escape abandons the edit; clearing it saves null.
 */
export function CategoryInput({
  value,
  suggestions,
  onCommit,
  disabled,
  placeholder = "e.g. Housekeeping",
  className,
}: {
  value: string | null;
  suggestions: readonly string[];
  onCommit: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const listId = React.useId();
  const current = value ?? "";
  const [draft, setDraft] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  if (seen !== current) {
    setSeen(current);
    setDraft(current);
  }
  /* Escape blurs, and blur commits — the draft reset has not rendered by then,
     so without this flag Escape would save what it was meant to throw away. */
  const abandon = React.useRef(false);

  const commit = () => {
    if (abandon.current) {
      abandon.current = false;
      return;
    }
    const typed = draft.trim();
    const next = suggestions.find((s) => s.toLowerCase() === typed.toLowerCase()) ?? typed;
    if (next !== current) onCommit(next || null);
    else setDraft(current);
  };

  return (
    <>
      <input
        value={draft}
        list={listId}
        disabled={disabled}
        maxLength={80}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            abandon.current = true;
            setDraft(current);
            e.currentTarget.blur();
          }
        }}
        className={className}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
