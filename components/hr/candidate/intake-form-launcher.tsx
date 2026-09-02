"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { IntakeInitial } from "@/components/hr/candidate/intake-wizard";

/** Must match DRAFT_LS_KEY in intake-wizard.tsx. */
const DRAFT_LS_KEY = "altus:intake:draft";

// The 108-field wizard is a full-screen surface — load it only on the client.
const IntakeWizard = dynamic(
  () => import("@/components/hr/candidate/intake-wizard").then((m) => m.IntakeWizard),
  { ssr: false },
);

/**
 * Renders the Candidate Interview Form full-screen. `initial` (when present)
 * resumes/edits a saved draft; absent = a fresh form. Autosaves to the DB.
 * Back → HR landing (Pre-Interview pop-up). Saved → Candidate Records.
 */
export function IntakeFormLauncher({
  positions,
  departments,
  canManagePositions,
  initial,
}: {
  positions: string[];
  departments: string[];
  canManagePositions: boolean;
  initial?: IntakeInitial;
}) {
  const router = useRouter();

  // Backup resume path: if we opened a fresh form (?new=1, no draft in the URL)
  // but a previous session's autosave left a draft pointer in localStorage that
  // never made it into the URL, resume it. "Start new" clears this pointer, so a
  // deliberate new start is never hijacked. Primary resume is the URL's ?draft.
  React.useEffect(() => {
    if (initial?.draftId) return;
    if (typeof window === "undefined") return;
    try {
      if (new URLSearchParams(window.location.search).get("draft")) return;
      const stored = window.localStorage.getItem(DRAFT_LS_KEY);
      if (stored) router.replace(`/hr/intake?draft=${stored}` as Route);
    } catch {
      /* storage disabled — nothing to restore. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IntakeWizard
      positions={positions}
      departments={departments}
      canManagePositions={canManagePositions}
      initial={initial}
      onClose={() => router.push("/hr?open=pre-interview" as Route)}
      onSaved={() => router.push("/hr/candidates" as Route)}
    />
  );
}
