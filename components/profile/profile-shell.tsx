"use client";

import { useState } from "react";
import { ProfileTabs, type ProfileTabKey } from "./profile-tabs";

interface Props {
  tabs: Record<ProfileTabKey, React.ReactNode>;
}

/**
 * Client wrapper that owns the active tab state and renders the matching
 * panel. Tabs are URL-hash routed inside ProfileTabs; this component
 * only renders the matching panel.
 */
export function ProfileShell({ tabs }: Props) {
  const [active, setActive] = useState<ProfileTabKey>("identity");

  return (
    <>
      <ProfileTabs onChange={setActive} />
      <div
        role="tabpanel"
        id={`profile-panel-${active}`}
        aria-labelledby={`profile-tab-${active}`}
        style={{ marginTop: 28 }}
      >
        {tabs[active]}
      </div>
    </>
  );
}
