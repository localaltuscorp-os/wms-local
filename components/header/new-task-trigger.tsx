import { getCurrentEmployee } from "@/lib/auth/current";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";

/**
 * The app's single <NewTaskDialog> mount, rendered once by the (app) layout.
 *
 * It is HEADLESS — the dialog renders no button of its own; the rail's visible
 * button is <NewTaskRailButton>, and every other entry point (the global header
 * +, the "N" shortcut) reaches it by dispatching NEW_TASK_OPEN_EVENT. Mounting
 * it at the layout root rather than inside the sidebar is what makes those
 * triggers work everywhere: the sidebar is not rendered on the hub or the
 * full-screen HR surfaces, and SidebarNewTask hides it outside WMS entirely, so
 * a dialog living there simply did not exist on most routes.
 *
 * Original note, still true: Deliberately does NOT fetch the modal's option
 * rosters (employees / clients / subjects / projects) — those load lazily on
 * first open inside NewTaskDialog (loadNewTaskOptions). Fetching them here ran
 * 4 DB queries on every header render AND every realtime `router.refresh()`,
 * and handed the OPEN modal fresh array identities that re-synced its dropdowns
 * mid-edit (the New Task modal instability). This component now only resolves
 * the cheap, request-cached current employee for the initiator default.
 */
export async function NewTaskTrigger() {
  const me = await getCurrentEmployee();
  if (!me) return null;
  return <NewTaskDialog defaultInitiatorId={me.id} isAdmin={me.isAdmin} />;
}
