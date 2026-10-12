import { FilePlus2 } from "lucide-react";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { PolicyDraftCreator } from "@/components/hr/policies/policy-draft-creator";

export const dynamic = "force-dynamic";

export default async function NewPolicyPage() {
  await requireWorkspaceAdmin("hr");
  return <div className="min-h-full bg-[#faf9fb]"><HrTitleBar title={<span className="inline-flex items-center gap-1.5"><FilePlus2 size={17} strokeWidth={2.4} style={{ color: "#A80400" }} />Create policy</span>} /><PageShell width="wide" py={false} className="pt-8 pb-24"><PolicyDraftCreator /></PageShell></div>;
}
