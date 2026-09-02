"use client";

import { useEffect } from "react";

/**
 * M4 Commit 3c — registers `/sw.js` once per browser session.  This is a
 * client component so it runs in the browser after hydration; it is
 * mounted near the top of `<body>` in `app/layout.tsx`.
 *
 * The SW handles inbound `push` + `notificationclick` events.  Without
 * a registered SW the browser silently drops every push the server
 * sends, so this is a hard prerequisite for the Web Push channel.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => {
        // Logging only — failure to register the SW must not crash the app.
        console.error("[Altus Corp] SW register failed", err);
      });
  }, []);
  return null;
}
