import { EnterWorkspaceLink } from "@/components/hub/enter-workspace-link";
import { AuraRailLens } from "@/components/layout/aura-rail-lens";
import type { AuraRoom } from "@/lib/aura-rooms";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * THE GLASS RAIL — the dashboard's workspace index.
 *
 * A port of `.claude/skills/aura/reference/aura-glass-rail.html`, to the letter
 * of `RAIL-SPEC.md`: a floating glass pane, rows numbered continuously across
 * groups, ONE travelling indicator instead of a background per row, and a red
 * light that flows across a row while it is hovered.
 *
 * Two departures from the reference, both forced by this being a real app
 * rather than a demo:
 *
 * ROWS ARE LINKS, NOT BUTTONS. They navigate, so they have to be anchors —
 * middle-click, copy-link and open-in-new-tab all stop working otherwise. They
 * go through `EnterWorkspaceLink`, which stamps the active-workspace cookie on
 * the way out, exactly as the tiles below do.
 *
 * THE COUNTS ARE REAL OR ABSENT. The spec's own open thread is that its badges
 * are static strings; here a row shows a count only where one actually exists
 * (WMS's due tasks, Goals' week score) and nothing at all otherwise.
 *
 * PINNED holds the first two rooms — the daily loop and the goals that drive
 * it — matching the reference. Everything else is ALL WORKSPACES. The numbering
 * runs continuously across both groups, so a row's number is its position in
 * the whole list, not in its section.
 */
export function AuraGlassRail({
  rooms,
  badges,
  current,
}: {
  rooms: AuraRoom[];
  /** Live counts, by room. A room with no entry shows no badge. */
  badges?: Partial<Record<WorkspaceId, string>>;
  /** The room being viewed, if any. The lens rests here. */
  current?: WorkspaceId | null;
}) {
  if (rooms.length === 0) return null;

  const pinned = rooms.slice(0, 2);
  const rest = rooms.slice(2);

  const row = (r: AuraRoom, index: number) => (
    <EnterWorkspaceLink
      key={r.id}
      id={r.id}
      href={r.href}
      ariaLabel={`Open ${r.label}`}
      className={current === r.id ? "aura-grail-nav is-active" : "aura-grail-nav"}
    >
      {/* The index is decoration, not content — the label already names the
          room, and a screen reader announcing "zero four Billing" is worse. */}
      <span className="aura-grail-no" aria-hidden>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="aura-grail-roll">
        <span>{r.label}</span>
      </span>
      {badges?.[r.id] && <span className="aura-grail-count">{badges[r.id]}</span>}
    </EnterWorkspaceLink>
  );

  return (
    <aside className="aura-grail" aria-label="Workspaces">
      <div className="aura-grail-inner">
        {/* The lens must be the FIRST child: it is absolutely positioned against
            this container, and it measures every row's offset within it. */}
        <AuraRailLens />

        <div className="aura-grail-label">PINNED</div>
        <nav className="aura-grail-group">{pinned.map((r, i) => row(r, i))}</nav>

        {rest.length > 0 && (
          <>
            <div className="aura-grail-label aura-spaced">ALL WORKSPACES</div>
            <nav className="aura-grail-group">{rest.map((r, i) => row(r, i + pinned.length))}</nav>
          </>
        )}
      </div>
    </aside>
  );
}
