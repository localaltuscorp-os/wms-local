"use client";

import * as React from "react";

/**
 * Debounce primitives for text input.
 *
 * WHY: several views in this app filter a large, already-loaded set on the
 * client (the task list, the dashboard tables, the accounts registers). The
 * naive wiring — `value={query} onChange={e => setQuery(e.target.value)}` on a
 * state variable owned by the component that also renders the list — makes
 * every keystroke re-render the whole table, and on a 100-row page that costs
 * more than the ~16ms a frame gets. The keypress-to-glyph gap is what the user
 * feels as "typing lag".
 *
 * The fix has two halves and BOTH are needed:
 *   1. the <input> keeps its own state, so the echo is one tiny re-render; and
 *   2. the expensive consumer (filter + list) is told about the new text on a
 *      debounce, so it re-renders a few times per burst instead of per key.
 *
 * `DEFAULT_DEBOUNCE_MS` is the project's standard delay for this. 300ms is long
 * enough to swallow a normal typing burst and short enough that the list still
 * feels like it is following you.
 */

export const DEFAULT_DEBOUNCE_MS = 300;

/**
 * A stable debounced wrapper around `fn`. The returned callback keeps its
 * identity for the life of the component (so it is safe in deps arrays and as a
 * prop to a memoized child) and always calls the LATEST `fn`.
 *
 * `.cancel()` drops a pending call; `.flush(...)` runs it immediately — use
 * flush for "commit now" moments (clear button, Escape, submit, unmount-save)
 * so those never wait out the delay.
 */
export interface DebouncedFn<A extends unknown[]> {
  (...args: A): void;
  cancel: () => void;
  flush: (...args: A) => void;
}

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number = DEFAULT_DEBOUNCE_MS,
): DebouncedFn<A> {
  // Latest-refs so the debounced identity never changes but the call is
  // current. Written in an effect, never during render.
  const fnRef = React.useRef(fn);
  const delayRef = React.useRef(delay);
  React.useEffect(() => {
    fnRef.current = fn;
    delayRef.current = delay;
  });

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending timers must die with the component — otherwise a debounced state
  // write lands after unmount and React warns (or worse, resurrects state).
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return React.useMemo(() => {
    const cancel = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const debounced = ((...args: A) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayRef.current);
    }) as DebouncedFn<A>;
    debounced.cancel = cancel;
    debounced.flush = (...args: A) => {
      cancel();
      fnRef.current(...args);
    };
    return debounced;
  }, []);
}

/** `value`, but only after it has stopped changing for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay: number = DEFAULT_DEBOUNCE_MS): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    if (Object.is(value, settled)) return;
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
    // `settled` is deliberately out of the deps: including it would restart the
    // timer when the debounced value lands, which is a no-op loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  return settled;
}

/**
 * The half-and-half a search box wants: `text` updates on every keystroke (so
 * the caret and the glyphs are instant) while `query` only settles after the
 * user pauses — feed `text` to the <input> and `query` to the filter.
 *
 * Use this when the input and the filtered list live in the SAME component and
 * the list is cheap enough that a per-keystroke re-render of the input's owner
 * is fine. When the list is expensive, put the input in its own child (see
 * `DebouncedSearchInput`) so the parent isn't re-rendered at all while typing.
 */
export function useSearchQuery(
  delay: number = DEFAULT_DEBOUNCE_MS,
  initial = "",
): {
  text: string;
  setText: (next: string) => void;
  /** Debounced, trimmed + lowercased — the form a matcher wants. */
  query: string;
  /** Debounced but verbatim, for callers that need the raw text. */
  rawQuery: string;
  clear: () => void;
} {
  const [text, setText] = React.useState(initial);
  const rawQuery = useDebouncedValue(text, delay);
  const query = React.useMemo(() => rawQuery.trim().toLowerCase(), [rawQuery]);
  const clear = React.useCallback(() => setText(""), []);
  return { text, setText, query, rawQuery, clear };
}
