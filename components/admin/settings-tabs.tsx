"use client";

import { useQueryState } from "nuqs";
import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

const TAB_KEYS = [
  "general",
  "statuses",
  "integrations",
  "notifications",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  general: "General",
  statuses: "Statuses",
  integrations: "Integrations",
  notifications: "Notifications",
};

// Slot-based: the Server Component page renders each tab body and passes
// it in. We mount all four with `forceMount` + `hidden` so switching tabs
// is instant — settings data is small enough that there's no payload cost
// to ship all four bodies on the first paint.
export function SettingsTabs(props: Record<TabKey, ReactNode>) {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: "general",
    parse: (v): TabKey =>
      (TAB_KEYS as readonly string[]).includes(v) ? (v as TabKey) : "general",
  });

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabKey)}>
      <Tabs.List
        className="mb-8 flex gap-1 border-b border-[rgba(15,23,42,0.08)] overflow-x-auto max-md:gap-0"
        aria-label="Settings sections"
      >
        {TAB_KEYS.map((k) => (
          <Tabs.Trigger key={k} value={k} className="settings-tab-trigger">
            {TAB_LABEL[k]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TAB_KEYS.map((k) => (
        <Tabs.Content key={k} value={k} forceMount hidden={tab !== k}>
          {props[k]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
