import { BufferingState } from "@/components/ui/spinner";

/**
 * Project Plan — the loading state for the whole module.
 *
 * ONE file at the segment root covers every route beneath it: Projects, the
 * Milestones and Results registers, Actions, Sub-Actions and the Kanban. They
 * are all `force-dynamic` server pages that read the plan tree before they can
 * render a single row, so without this a click on "Milestones" sits on the
 * previous screen with no feedback until the query returns.
 *
 * A plain spinner rather than a table skeleton, matching /projects and /tasks:
 * a skeleton of a fourteen-column register is a lot of animated DOM to build
 * and throw away on every navigation.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center">
      <BufferingState label="Loading the project plan…" />
    </div>
  );
}
