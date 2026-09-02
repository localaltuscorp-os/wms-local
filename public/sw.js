/* Altus Corp Service Worker — M4 Commit 3c
 *
 * Receives Web Push events from the server (see lib/web-push/client.ts)
 * and renders a native browser notification.  Clicking the notification
 * focuses an existing window (or opens a new one) on the deep-link URL
 * the server included in the push payload.
 *
 * The payload shape is defined in lib/web-push/payload.ts:
 *   { title, body, url, tag, kind }
 *
 * NOTE: Plain JS, not TypeScript — Next.js serves this verbatim from
 * /public.  Don't put it under /app or it'll be processed by the bundler.
 */

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-badge.png",
      tag: data.tag,
      data: { url: data.url },
      requireInteraction: data.kind === "task_assigned",
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.host));
      if (existing) {
        existing.focus();
        if ("navigate" in existing) {
          try {
            existing.navigate(targetUrl);
          } catch {
            /* older browsers — focus is enough */
          }
        }
        return existing;
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
