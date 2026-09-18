import { Lock } from "lucide-react";

/** Shown in place of "Create" on the Subjects / Clients screens for anyone who
 *  may look but not change them (lib/security/capabilities.ts). */
export function RosterLockedNote({ noun }: { noun: "subjects" | "clients" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-[13px] font-semibold text-ink-soft">
      <Lock size={14} strokeWidth={2.4} />
      Locked — only Manan Sir, Jeevan and Rohan can change {noun}.
    </span>
  );
}
