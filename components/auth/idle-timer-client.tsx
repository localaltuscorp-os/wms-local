"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { IdleTimer } from "@/components/auth/idle-timer";

export function IdleTimerClient({ timeoutMinutes }: { timeoutMinutes: number }) {
  const router = useRouter();
  // Stable callback so IdleTimer doesn't tear down listeners every render.
  const onTimeout = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Best-effort; navigate regardless so middleware redirects.
    }
    router.replace("/login?reason=idle");
  }, [router]);
  return <IdleTimer timeoutMs={timeoutMinutes * 60_000} onTimeout={onTimeout} />;
}
