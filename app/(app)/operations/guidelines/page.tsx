import { ScrollText } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { ComingSoon } from "@/components/layout/coming-soon";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → Guidelines.
 *
 * Wired exactly like Checklist beside it, and awaiting content for the same
 * reason. Worth noting for whoever fills it in: HR already owns a Policies
 * surface (`/policies`, lib/hr/sections) for the company handbook. If these
 * guidelines turn out to be policies in another coat, the right move is to
 * point this area at that data rather than to grow a second, competing store of
 * written rules.
 */
export default async function OperationsGuidelinesPage() {
  await requireWorkspace("operations");
  return (
    <ComingSoon
      title="Guidelines"
      description="How the operations team works — the written rules, in one place. The area is wired into the room; the guidelines themselves are still to be written."
      Icon={ScrollText}
    />
  );
}
