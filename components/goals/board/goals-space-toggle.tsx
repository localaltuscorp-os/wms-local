"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, User } from "lucide-react";

/** Cookie name — kept in lockstep with lib/goals/space.ts GOALS_SPACE_COOKIE
 *  (that module is server-only, so the client can't import the constant). */
const COOKIE = "goals_space";

type Space = "professional" | "personal";

function readSpace(): Space {
  if (typeof document === "undefined") return "professional";
  const m = document.cookie.match(/(?:^|;\s*)goals_space=(personal|professional)/);
  return (m?.[1] as Space) ?? "professional";
}

/**
 * Personal | Professional switch (admins only) — a segmented pill under
 * "Back to Hub" in the Goals rail. Writes the `goals_space` cookie and jumps to
 * the Yearly board in the chosen space. Personal is the admin's PRIVATE goals
 * world; Professional is the shared module.
 */
/** One segment of the pill. Declared at module scope — defining it inside
 *  `GoalsSpaceToggle` gives React a brand-new component type on every render,
 *  which remounts both buttons (losing focus mid-interaction) instead of
 *  updating them. */
function Seg({
  value,
  label,
  Icon,
  active,
  onPick,
}: {
  value: Space;
  label: string;
  Icon: typeof User;
  active: boolean;
  onPick: (next: Space) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      aria-pressed={active}
      title={label}
      className="relative inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[9px] px-1.5 py-1.5 text-[12px] font-bold transition-colors"
      style={
        active
          ? { background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", color: "#fff", boxShadow: "0 6px 14px -8px var(--color-altus-red-deep)" }
          : { color: "var(--color-ink-muted)" }
      }
    >
      <Icon size={13} strokeWidth={2.5} className="shrink-0" />
      <span className="sidebar-collapsible-hide truncate">{label}</span>
    </button>
  );
}

export function GoalsSpaceToggle() {
  const router = useRouter();
  const [space, setSpace] = React.useState<Space>("professional");
  React.useEffect(() => setSpace(readSpace()), []);

  function pick(next: Space) {
    if (next === space) return;
    document.cookie = `${COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setSpace(next);
    router.push("/goals/yearly");
    router.refresh();
  }

  return (
    <div className="px-4 pb-2">
      <div
        className="flex items-center gap-1 rounded-xl p-1"
        style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
        role="group"
        aria-label="Goals space"
      >
        <Seg value="professional" label="Professional" Icon={Briefcase} active={space === "professional"} onPick={pick} />
        <Seg value="personal" label="Personal" Icon={User} active={space === "personal"} onPick={pick} />
      </div>
    </div>
  );
}
