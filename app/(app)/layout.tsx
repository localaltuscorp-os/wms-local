import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const settings = await getOrgSettings();
  return (
    <>
      <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
      <KeyboardShortcuts />
      {children}
    </>
  );
}
