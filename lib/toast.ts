"use client";

import { toast as sonnerToast } from "sonner";

export interface ToastDetail {
  id: string;
  message: string;
  actionLabel?: string;
  // The action is stored by id on the host's internal map (functions don't cross CustomEvent boundaries reliably).
}

const HANDLERS = new Map<string, () => void | Promise<void>>();
const TOAST_EVENT = "vp-toast";

// Heuristic: colour clearly-failure messages red and everything else green so
// the hundreds of existing fireToast() callers get premium coloured toasts
// without each having to pass a type. Callers can still force one.
const ERROR_RE =
  /\b(could ?n'?t|cannot|can'?t|fail(ed|ure)?|error|invalid|too many|denied|not allowed|no permission|unable|wrong|stale|forbidden)\b/i;

/**
 * App-wide toast — backed by sonner (premium, accessible, stacked). Signature
 * is unchanged from the legacy event-bus version so every existing call site
 * keeps working; an optional `type` overrides the auto colour.
 */
export function fireToast(opts: {
  message: string;
  actionLabel?: string;
  action?: () => void | Promise<void>;
  type?: "success" | "error" | "info";
}): void {
  const kind = opts.type ?? (ERROR_RE.test(opts.message) ? "error" : "success");
  const options =
    opts.action !== undefined
      ? {
          action: {
            label: opts.actionLabel ?? "Undo",
            onClick: () => {
              void opts.action?.();
            },
          },
        }
      : undefined;
  if (kind === "error") sonnerToast.error(opts.message, options);
  else if (kind === "info") sonnerToast(opts.message, options);
  else sonnerToast.success(opts.message, options);
}

export function consumeHandler(id: string): (() => void | Promise<void>) | undefined {
  const fn = HANDLERS.get(id);
  HANDLERS.delete(id);
  return fn;
}

export const TOAST_EVENT_NAME = TOAST_EVENT;
