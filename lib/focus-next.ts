const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Move focus to the next (or previous) visible focusable element after `from`
 * in DOM order. Used so that pressing Tab inside a combobox commits the
 * highlighted option AND advances to the next field — the way native form
 * controls behave — instead of trapping the user or forcing the mouse.
 */
export function focusNextFrom(from: HTMLElement | null, dir: 1 | -1 = 1): void {
  if (typeof document === "undefined" || !from) return;
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      el === from ||
      el.offsetWidth > 0 ||
      el.offsetHeight > 0 ||
      el.getClientRects().length > 0,
  );
  const i = nodes.indexOf(from);
  if (i === -1) return;
  nodes[i + dir]?.focus();
}
