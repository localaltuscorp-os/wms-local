"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { queueEvent, startActivityTracker } from "@/lib/logs/client-tracker";
import { classifyRoute } from "@/lib/logs/module-map";

/**
 * THE CLIENT ACTIVITY TRACKER — mounted once in the (app) layout and once in the
 * (admin) layout (they are separate trees). Records PAGE_VISIT on every route
 * change, MODULE_VISIT when the module changes, and the time spent on the
 * previous page. Renders nothing.
 *
 * Route changes are observed through `usePathname()` — no history hacking, no
 * polling. Events are buffered in IndexedDB and flushed in batches by
 * `startActivityTracker`.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const prev = useRef<{ path: string; module: string; ts: number } | null>(null);

  useEffect(() => startActivityTracker(), []);

  useEffect(() => {
    const cls = classifyRoute(pathname);
    const now = Date.now();
    const last = prev.current;

    if (last) {
      void queueEvent({
        type: "PAGE_VISIT",
        route: pathname,
        estimatedMs: Math.max(0, now - last.ts),
      });
      if (cls.module && cls.module !== last.module) {
        void queueEvent({ type: "MODULE_VISIT", route: pathname });
      }
    } else {
      // First page of the session.
      void queueEvent({ type: "PAGE_VISIT", route: pathname });
      if (cls.module) void queueEvent({ type: "MODULE_VISIT", route: pathname });
    }

    prev.current = { path: pathname, module: cls.module, ts: now };
  }, [pathname]);

  return null;
}
