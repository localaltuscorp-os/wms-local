import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listDistinctSubjects, listDistinctClients } from "@/lib/queries/tasks";
import { TASK_SUBJECTS, PRIORITY_LABELS, TASK_PRIORITIES } from "@/db/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/task-form — pick-list data for the native "New task" form:
 * the active-employee roster (doer/initiator), the subject + client rosters,
 * the priority options, and the signed-in user (default initiator).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const [employees, dbSubjects, clients] = await Promise.all([
    listEmployeeOptions(),
    listDistinctSubjects(),
    listDistinctClients(),
  ]);

  // Union of the canonical subject list + any free-text subjects already in use.
  const subjects = Array.from(new Set([...TASK_SUBJECTS, ...dbSubjects])).sort();

  return NextResponse.json(
    {
      me: { id: me.id, name: me.name },
      employees,
      subjects,
      clients,
      priorities: TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
    },
    { headers: MOBILE_CORS },
  );
}
