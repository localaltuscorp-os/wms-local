import { notFound } from "next/navigation";
import { ProjectViews } from "@/components/project-plan/project-views";
import { EMPTY_SELECTION } from "@/lib/project-plan/views";
import { SAMPLE_PLAN, SAMPLE_ATTACHMENT_COUNTS } from "./sample-plan";

/**
 * PROJECT VIEWS — the layout preview, on fixture data.
 *
 * WHY IT EXISTS. Every real screen resolves the signed-in employee before it
 * renders anything, so when the database is unreachable there is no way to look
 * at a UI change at all. This route renders the REAL `ProjectViews` component —
 * same file, same CSS, same columns — against a hand-written plan, so the
 * layout can be worked on while the data source is down.
 *
 * WHY IT IS OUTSIDE `(app)`. The `(app)` layout calls `requireUser()`, which is
 * the very query that is failing. The root layout already tolerates a dead
 * database (`getCurrentEmployee().catch(() => null)`), so a route that sits
 * outside the group renders with the app's fonts, accent variables and global
 * CSS and touches nothing else.
 *
 * IT IS DEVELOPMENT-ONLY, twice over: `notFound()` here, and the middleware's
 * public-path exemption is itself gated on NODE_ENV (see proxy.ts). A
 * production build has no route to reach and no exemption to reach it with.
 *
 * WHAT DOES NOT WORK HERE. Reading is all of it. The status picker, the
 * progress editor, the attachment cell and the Start/Stop timer render their
 * current state, but ACTING on one calls a server action that goes to the
 * database — which is exactly what is unavailable. Expect an error toast if you
 * click one. Expanding, collapsing, searching and filtering are pure client
 * work and behave exactly as they do in the real screen.
 *
 * DELETE THIS DIRECTORY once the database is back — along with the `/ui-preview`
 * entry in proxy.ts. It is scaffolding, not a feature.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-[1600px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
      <div className="mb-5 rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-4 py-2.5">
        <p className="text-[12.5px] font-bold text-ink-strong">
          Layout preview — fixture data, not the real plan.
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-ink-muted">
          Expand, collapse, search and the project filter all work. Status, progress,
          files and the timer need the database, so clicking one will fail until it is back.
        </p>
      </div>

      <ProjectViews
        tree={SAMPLE_PLAN}
        initialSelection={EMPTY_SELECTION}
        attachmentCounts={SAMPLE_ATTACHMENT_COUNTS}
        me={{ id: "preview-viewer", isAdmin: true }}
        downline={[]}
      />
    </main>
  );
}
