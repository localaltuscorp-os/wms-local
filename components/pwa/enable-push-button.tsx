"use client";

import { useEffect, useState } from "react";
import { fireToast } from "@/lib/toast";

/**
 * M4 Commit 3c — the per-device "Enable push" affordance.  Lives under
 * /profile's notification-channel card.
 *
 * Lifecycle:
 *   1. On mount, inspect Notification.permission + the existing
 *      PushManager subscription to render the right state.
 *   2. "Enable" -> requestPermission -> subscribe -> POST /api/push/subscribe.
 *   3. "Turn off" -> unsubscribe + DELETE /api/push/subscribe.
 *
 * Edge cases:
 *   - Browser without Notification API (older Safari, some embedded webviews)
 *     -> render an unsupported note.
 *   - Permission already denied -> render an "unblock in settings" note.
 *   - Service Worker not yet ready -> awaiting `navigator.serviceWorker.ready`
 *     covers this transparently.
 */

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

type PermissionState = NotificationPermission | "unsupported";

export function EnablePushButton() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setSubscribed(!!s))
      .catch(() => {
        // ignore — assume not subscribed if the lookup blows up
      });
  }, []);

  async function enable() {
    try {
      setPending(true);
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = (await fetch("/api/push/vapid-key").then((r) =>
        r.json(),
      )) as { publicKey: string };
      if (!publicKey) {
        fireToast({
          message: "Push isn't configured on the server yet.",
        });
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setSubscribed(true);
      fireToast({ message: "Push notifications enabled on this device." });
    } catch (err) {
      fireToast({
        message: `Could not enable push: ${(err as Error).message}`,
      });
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    try {
      setPending(true);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setSubscribed(false);
        return;
      }
      await sub.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      setSubscribed(false);
      fireToast({ message: "Push disabled on this device." });
    } catch (err) {
      fireToast({
        message: `Could not disable push: ${(err as Error).message}`,
      });
    } finally {
      setPending(false);
    }
  }

  if (permission === "unsupported") {
    return (
      <p className="text-xs text-[#94A3B8]">
        This browser doesn&apos;t support Web Push.
      </p>
    );
  }
  if (permission === "denied") {
    return (
      <p className="text-xs text-[#A80400]">
        Push is blocked. Re-enable it in your browser&apos;s site settings.
      </p>
    );
  }
  if (subscribed) {
    return (
      <button
        type="button"
        onClick={disable}
        disabled={pending}
        className="rounded-md border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] hover:bg-[#F5F5F7] disabled:opacity-50"
      >
        ✓ Push enabled — turn off
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={enable}
      disabled={pending}
      className="rounded-md py-2 px-4 text-sm font-medium text-white disabled:opacity-70"
      style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
    >
      {pending ? "Enabling…" : "Enable push notifications"}
    </button>
  );
}
