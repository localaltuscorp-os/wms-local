import { Package } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { isHrStaff } from "@/lib/hr/access";
import { isMissingRegisterTable, listAssetPeople, listAssets } from "@/lib/hr/registers-server";
import { AssetRegister } from "@/components/hr/registers/asset-register";
import { RegisterSetupNeeded } from "@/components/hr/registers/register-setup-needed";

export const dynamic = "force-dynamic";

const ACCENT = "#B91C1C";

/**
 * HR → Asset Register. Every company asset with an auto-generated code per type
 * (LAP-0001). Everyone in HR can view; Ruchita, Rutvisha and Manan can change it,
 * and only they ever receive usernames or can reveal passwords.
 */
export default async function AssetRegisterPage() {
  const me = await requireWorkspace("hr");
  // Hiding the controls is a courtesy; the actions ask the same question again.
  const canEdit = await isHrStaff(me);

  let assets, people;
  try {
    [assets, people] = await Promise.all([listAssets({ withCredentials: canEdit }), listAssetPeople()]);
  } catch (e) {
    if (!isMissingRegisterTable(e)) throw e;
    return <RegisterSetupNeeded title="Asset Register" />;
  }

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#FEE2E2", color: ACCENT }}>
          <Package className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Asset Register</h1>
          <p className="text-[13px] text-ink-muted">Laptops, phones, licences and everything else the firm owns — and who has it.</p>
        </div>
      </header>
      <AssetRegister assets={assets} people={people} canEdit={canEdit} />
    </PageShell>
  );
}
