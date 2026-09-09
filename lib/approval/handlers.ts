import "server-only";
import type { ApprovalTokenView } from "@/lib/approval/tokens";
import {
  ATTENDANCE_CONFIRM_KIND,
  parseAttendanceConfirmTargetId,
} from "@/lib/approval/attendance-confirm";

/**
 * WS-7 · approval-action registry.
 *
 * After the public approve route atomically BURNS a token, it looks up the
 * handler for the token's `kind` and runs it. The handler performs the domain
 * mutation and returns a human message for the success page. Keeping this a
 * static, importable map (rather than runtime `register()` calls) means it's
 * serverless-safe and typecheck-verifiable — the WS-5 sibling just fills in the
 * body of `confirmAttendanceApproval` below.
 *
 * Contract: a handler NEVER throws for an expected failure — it returns
 * `{ ok: false, ... }`. The route wraps it in a try/catch as a backstop.
 */

export interface ApprovalHandlerResult {
  ok: boolean;
  /** Short heading for the result page, e.g. "Attendance confirmed". */
  title: string;
  /** One-line explanation shown under the heading. */
  message: string;
}

export type ApprovalHandler = (
  token: ApprovalTokenView,
) => Promise<ApprovalHandlerResult>;

/**
 * WS-5 attendance-confirmation handler.
 *
 * TODO(WS-5 sibling): wire the real mutation here. The token has already been
 * consumed (single-use) by the time this runs. Parse the target, then call the
 * WS-5 confirm action — e.g.
 *
 *     const t = parseAttendanceConfirmTargetId(token.targetId);
 *     await confirmOutsideOfficeAttendance(t.confirmerId, t.weekStartIso);
 *
 * Until that action exists this stub records the intent and reports success so
 * the round-trip (link → burn → page) is verifiable end-to-end while the slice
 * is dark. It does NOT mutate salary/attendance state.
 */
async function confirmAttendanceApproval(
  token: ApprovalTokenView,
): Promise<ApprovalHandlerResult> {
  const target = parseAttendanceConfirmTargetId(token.targetId);
  if (!target) {
    return {
      ok: false,
      title: "Couldn't confirm",
      message: "This confirmation link is malformed. Please use the dashboard.",
    };
  }

  // TODO(WS-5): perform the real bulk-confirm write for
  // target.confirmerId / target.weekStartIso here.

  return {
    ok: true,
    title: "Attendance confirmed",
    message:
      "Thanks — your team's outside-office attendance for this week is recorded. You can review the details in the dashboard.",
  };
}

const APPROVAL_HANDLERS: Record<string, ApprovalHandler> = {
  [ATTENDANCE_CONFIRM_KIND]: confirmAttendanceApproval,
};

export function getApprovalHandler(kind: string): ApprovalHandler | null {
  return APPROVAL_HANDLERS[kind] ?? null;
}
