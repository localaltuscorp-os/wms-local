import { Suspense, type ReactNode } from "react";
import { OperationsQuickNavServer } from "@/components/operations/operations-quick-nav-server";

/**
 * Training is an AREA INSIDE OPERATIONS (2026-09-12) but kept its own route
 * tree at /training, so every existing link and bookmark still resolves —
 * including the `/training/<id>` deep links that go out in assignment emails.
 *
 * This layout is what gives it the room's quick-access row — Library · Calendar
 * · Self-Learning · Share · Obligations · Induction · Feedback · Dashboard —
 * the same one /operations, /events and /people-allocation mount. Without it
 * the Operations rail would name Training and then strand you on the Library
 * with no way to reach the other seven pages, because the rail carries AREAS
 * and the pages live on the row.
 *
 * Nothing else: access is still asserted by each page and action with
 * requireWorkspace("training"), unchanged by the move — the WorkspaceId did not
 * go anywhere, it simply stopped owning a hub card.
 */
export default function TrainingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="training-module">
      <style>{`
        .training-module header > span,
        .training-module header > p,
        .training-module header > div:first-child > span,
        .training-module header > div:first-child > p {
          display: none !important;
        }
        .training-module header > h1,
        .training-module header > div:first-child > h1 {
          margin-top: 0 !important;
          font-family: var(--font-display), system-ui, sans-serif !important;
          font-size: clamp(22px, 2vw, 32px) !important;
          font-weight: 800 !important;
          line-height: 1.02 !important;
        }
        .training-module header {
          margin-bottom: 1rem !important;
        }
      `}</style>
      <Suspense fallback={null}>
        <OperationsQuickNavServer />
      </Suspense>
      {children}
    </div>
  );
}
