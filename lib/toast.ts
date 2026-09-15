"use client";

import { toast as sonnerToast } from "sonner";
import { toastKind } from "./toast-severity";

export interface ToastDetail {
  id: string;
  message: string;
  actionLabel?: string;
  // The action is stored by id on the host's internal map (functions don't cross CustomEvent boundaries reliably).
}

const HANDLERS = new Map<string, () => void | Promise<void>>();
const TOAST_EVENT = "vp-toast";

// The colour heuristic lives in ./toast-severity so it can be tested without
// sonner or a client boundary. An explicit `type` still overrides it.

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
  /** Override the host's default lifetime (ms) — e.g. a longer-lived Undo. */
  duration?: number;
}): void {
  const kind = toastKind(opts.message, opts.type);
  const options =
    opts.action !== undefined || opts.duration !== undefined
      ? {
          ...(opts.duration !== undefined ? { duration: opts.duration } : null),
          ...(opts.action !== undefined
            ? {
                action: {
                  label: opts.actionLabel ?? "Undo",
                  onClick: () => {
                    void opts.action?.();
                  },
                },
              }
            : null),
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
