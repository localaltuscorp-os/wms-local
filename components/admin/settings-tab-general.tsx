"use client";
import { SettingsForm } from "./settings-form";
import type { OrgSettings } from "@/db/schema";

// Thin shim around the existing SettingsForm so the tabbed shell can drop
// it into a tab slot. Keeping the form unchanged means migration 0017 is
// the only thing General relies on, and any future tab-specific chrome
// (banner, contextual help) lives here without touching the form.
export function SettingsTabGeneral({ current }: { current: OrgSettings }) {
  return <SettingsForm current={current} />;
}
