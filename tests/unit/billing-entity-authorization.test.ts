import { describe, it, expect, vi } from "vitest";
import { codeOf } from "../fixtures/source-code";
import {
  canDeleteBillingEntity,
  emailsWithCapability,
  hasCapability,
  canManageDevices,
} from "@/lib/security/capabilities";
import { isMasterAdmin } from "@/lib/security/capability-grants";
import { isSuperAdmin } from "@/lib/auth/super-admin";

vi.mock("@/lib/security/capability-grants", () => ({
  isMasterAdmin: async (email: string | null | undefined) =>
    email === "rohanchoudhary.altuscorp@gmail.com" || email === "manan@unleashed.in",
}));
import {
  allPermissionNodes,
  isPermissionNodeKey,
  nodeChain,
  nodeKeyForPath,
} from "@/lib/permissions/catalog";
import { effectiveFor, type OverrideMap, type PermissionOverride } from "@/lib/permissions/effective";

/**
 * BILLING MASTER — WHO MAY DO WHAT, AND WHERE IT IS ENFORCED.
 *
 * Two kinds of assertion, and the second is the one that keeps this true:
 *   1. the rules answer correctly today, and
 *   2. the enforcement sits in the SERVER ACTIONS — so a rule cannot be
 *      satisfied by a hidden button while the endpoint behind it stays open.
 */

const MANAN = "manan@unleashed.in";
const ROHAN = "rohanchoudhary.altuscorp@gmail.com";
const RUCHITA = "ruchitaambre.altuscorp@gmail.com";
const RUTVISHA = "rutvishamehta.altuscorp@gmail.com";
const EMPLOYEE = "someone.else@altuscorp.com";

/* ════════════════════════════════════════════════════════════════════════════
   §5 DELETE — ONLY MANAN
   ════════════════════════════════════════════════════════════════════════════ */

describe("deleting an entity is Manan's alone", () => {
  it("Manan may", () => {
    expect(canDeleteBillingEntity(MANAN)).toBe(true);
  });

  it("exactly ONE address holds the capability", () => {
    expect(emailsWithCapability("billing_entity.delete")).toEqual([MANAN]);
  });

  it("nobody else may — not the other master admin, not a device admin", () => {
    for (const email of [ROHAN, RUCHITA, RUTVISHA, EMPLOYEE]) {
      expect(canDeleteBillingEntity(email), email).toBe(false);
    }
  });

  it("being a master admin is not enough", async () => {
    // The brief: "Even if another user has Entity Edit, Admin access, File
    // Manage, or other Billing Master permissions, they must NOT be able to
    // delete an entity." Rohan is the most privileged person who is not Manan.
    expect(await isMasterAdmin(ROHAN)).toBe(true);
    expect(canDeleteBillingEntity(ROHAN)).toBe(false);
  });

  it("being a super-admin is not enough", () => {
    expect(isSuperAdmin(ROHAN)).toBe(true);
    expect(canDeleteBillingEntity(ROHAN)).toBe(false);
  });

  it("holding every other capability is not enough", () => {
    expect(canManageDevices(RUCHITA)).toBe(true);
    expect(hasCapability(RUCHITA, "attendance.manage_others")).toBe(true);
    expect(canDeleteBillingEntity(RUCHITA)).toBe(false);
  });

  it("fails closed on an unknown, blank or near-miss address", () => {
    expect(canDeleteBillingEntity(null)).toBe(false);
    expect(canDeleteBillingEntity(undefined)).toBe(false);
    expect(canDeleteBillingEntity("")).toBe(false);
    expect(canDeleteBillingEntity("   ")).toBe(false);
    expect(canDeleteBillingEntity("manan@unleashed.in.evil.com")).toBe(false);
    expect(canDeleteBillingEntity("xmanan@unleashed.in")).toBe(false);
  });

  it("matches case- and whitespace-insensitively, as sign-in does", () => {
    expect(canDeleteBillingEntity("Manan@Unleashed.IN")).toBe(true);
    expect(canDeleteBillingEntity("  manan@unleashed.in  ")).toBe(true);
  });

  it("is a capability of its own, not derived from being the founder", () => {
    // Keyed off `isFounderEmail`, a change of founder would silently move the
    // authority, and a second person needing it could only be added by making
    // them a founder.
    const caps = codeOf("lib/security/capabilities.ts");
    expect(caps).toMatch(/"billing_entity\.delete"/);
    const guard = codeOf("lib/billing/delete-guard.ts");
    expect(guard).not.toMatch(/isFounderEmail|FOUNDER_EMAIL|isSuperAdmin/);
  });
});

describe("the delete guard is one function, consulted by both the page and the action", () => {
  const guard = codeOf("lib/billing/delete-guard.ts");
  const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");
  const page = codeOf("app/(admin)/admin/billing-master/page.tsx");

  it("both the page and the action read the same guard", () => {
    // A visible button that refuses is a bug report; a hidden one that would
    // have worked is a mystery. One source of the answer prevents both.
    expect(page).toMatch(/mayDeleteBillingEntity/);
    expect(actions).toMatch(/mayDeleteBillingEntity/);
  });

  it("it checks BOTH the real and the effective identity", () => {
    // Effective, so Manan delegated into someone else's account cannot delete
    // as them. Real, so nobody delegated into a privileged account inherits it.
    expect(guard).toMatch(/getCurrentEmployee/);
    expect(guard).toMatch(/getSignedInEmployee/);
    expect(guard).toMatch(/canDeleteBillingEntity\(effective\.email\)\s*&&\s*canDeleteBillingEntity\(real\.email\)/);
  });

  it("it fails closed when nobody is signed in", () => {
    expect(guard).toMatch(/if \(!effective \|\| !real\) return false/);
  });

  it("the delete action checks the capability BEFORE it reads anything", () => {
    const start = actions.indexOf("export async function deleteBillingEntity");
    const body = actions.slice(start, start + 900);
    const capAt = body.indexOf("mayDeleteBillingEntity");
    const selectAt = body.indexOf("db\n    .select");
    expect(capAt).toBeGreaterThan(-1);
    // The refusal must not depend on the entity existing, so the answer cannot
    // differ for a valid id versus an invalid one.
    if (selectAt > -1) expect(capAt).toBeLessThan(selectAt);
  });

  it("the strong confirmation is verified SERVER-SIDE, not only in the dialog", () => {
    const start = actions.indexOf("export async function deleteBillingEntity");
    const body = actions.slice(start, actions.indexOf("revalidatePath(PATH)", start));
    expect(body).toMatch(/confirmName/);
    expect(body).toMatch(/toLowerCase\(\) !== entity\.name\.toLowerCase\(\)/);
  });

  it("invoice references do NOT block the delete", () => {
    // "The user has explicitly decided that deletion is allowed even when the
    // entity has existing invoices. Do NOT block deletion because of invoice
    // references."
    const start = actions.indexOf("export async function deleteBillingEntity");
    const body = actions.slice(start);
    expect(body).not.toMatch(/invoiceCount|hasInvoices|referenced.*return \{ ok: false/);
  });

  it("the version history is snapshotted BEFORE the row is deleted", () => {
    const start = actions.indexOf("export async function deleteBillingEntity");
    const body = actions.slice(start);
    const snapAt = body.indexOf('writeVersion(entity.id, "deleted"');
    const delAt = body.indexOf("db.delete(payingEntities)");
    expect(snapAt).toBeGreaterThan(-1);
    expect(delAt).toBeGreaterThan(-1);
    // After the delete there is nothing left to snapshot.
    expect(snapAt).toBeLessThan(delAt);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §4 + §8 THE FOUR CAPABILITIES, AND SERVER-SIDE ENFORCEMENT
   ════════════════════════════════════════════════════════════════════════════ */

describe("the permission matrix carries Billing Master", () => {
  it("registers both nodes — the entity and its files", () => {
    expect(isPermissionNodeKey("admin.masters.billing")).toBe(true);
    expect(isPermissionNodeKey("admin.masters.billing-files")).toBe(true);
  });

  it("the route resolves to the entity node", () => {
    expect(nodeKeyForPath("/admin/billing-master")).toBe("admin.masters.billing");
  });

  it("both sit under Admin Panel › Masters", () => {
    expect(nodeChain("admin.masters.billing")).toEqual([
      "admin",
      "admin.masters",
      "admin.masters.billing",
    ]);
    expect(nodeChain("admin.masters.billing-files")).toEqual([
      "admin",
      "admin.masters",
      "admin.masters.billing-files",
    ]);
  });

  it("stays within the catalogue's three levels", () => {
    // A fourth level throws at module load, which is why the files node is a
    // sibling rather than a child.
    //
    // SEVEN, not two: the Billing master screens added on the Shreya branch
    // (Profiles, Customers, Payment Terms, SAC Codes, Product Billing Fields)
    // are siblings of Billing Master and Billing Files, not children of them.
    // The count is incidental; the depth check below is what this guards.
    const nodes = allPermissionNodes().filter((n) => n.key.startsWith("admin.masters.billing"));
    expect(nodes).toHaveLength(7);
    for (const n of nodes) expect(n.depth).toBe(3);
  });

  it("the files node owns no route of its own", () => {
    const files = allPermissionNodes().find((n) => n.key === "admin.masters.billing-files");
    expect(files?.routes ?? []).toEqual([]);
  });
});

describe("file access is separate from entity edit (§4)", () => {
  const map = (entries: Record<string, PermissionOverride>): OverrideMap =>
    new Map(Object.entries(entries));

  const ALLOW = { canShow: true, canView: true, canEdit: true };

  it("entity EDIT does not confer file MANAGE — the brief's explicit case", () => {
    const overrides = map({
      "admin.masters.billing": ALLOW,
      "admin.masters.billing-files": { canShow: true, canView: true, canEdit: false },
    });
    expect(effectiveFor("admin.masters.billing", overrides).edit).toBe(true);
    expect(effectiveFor("admin.masters.billing-files", overrides).view).toBe(true);
    expect(effectiveFor("admin.masters.billing-files", overrides).edit).toBe(false);
  });

  it("file VIEW can be withdrawn while the entity stays editable", () => {
    const overrides = map({
      "admin.masters.billing": ALLOW,
      "admin.masters.billing-files": { canShow: false, canView: false, canEdit: false },
    });
    expect(effectiveFor("admin.masters.billing", overrides).edit).toBe(true);
    expect(effectiveFor("admin.masters.billing-files", overrides).view).toBe(false);
  });

  it("read-only entity access is expressible — view yes, edit no", () => {
    const overrides = map({
      "admin.masters.billing": { canShow: true, canView: true, canEdit: false },
    });
    const eff = effectiveFor("admin.masters.billing", overrides);
    expect(eff.view).toBe(true);
    expect(eff.edit).toBe(false);
  });

  it("denying the Masters group takes Billing Master with it", () => {
    const overrides = map({
      "admin.masters": { canShow: false, canView: false, canEdit: false },
    });
    expect(effectiveFor("admin.masters.billing", overrides).view).toBe(false);
    expect(effectiveFor("admin.masters.billing-files", overrides).view).toBe(false);
  });

  it("no override means no opinion — the matrix does not lock the feature by default", () => {
    const eff = effectiveFor("admin.masters.billing", new Map());
    expect(eff).toEqual({ show: true, view: true, edit: true });
  });
});

describe("the entity→files cascade is applied in code, since the nodes are siblings", () => {
  const queries = codeOf("lib/queries/billing-entities.ts");
  const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");

  it("billingEntityAccess ANDs entity view into both file answers", () => {
    expect(queries).toMatch(/fileView:\s*entityView && fileView/);
    expect(queries).toMatch(/fileManage:\s*entityView && fileManage/);
  });

  it("the file-write guard re-applies it, so an endpoint cannot be reached past it", () => {
    const start = actions.indexOf("async function requireFileManage");
    const body = actions.slice(start, start + 400);
    expect(body).toMatch(/requireModuleEdit\("admin\.masters\.billing-files"\)/);
    expect(body).toMatch(/canViewModule\("admin\.masters\.billing"\)/);
    expect(body).toMatch(/forbiddenError\(\)/);
  });
});

describe("§8 EVERY mutation is protected server-side", () => {
  const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");

  /** Each exported action and the guard it must open with. */
  const MUTATIONS: { fn: string; guard: RegExp }[] = [
    { fn: "createBillingEntity", guard: /requireEntityEdit\(\)/ },
    { fn: "updateBillingEntity", guard: /requireEntityEdit\(\)/ },
    { fn: "uploadBillingEntityFile", guard: /requireFileManage\(\)/ },
    { fn: "removeBillingEntityFile", guard: /requireFileManage\(\)/ },
    { fn: "deleteBillingEntity", guard: /mayDeleteBillingEntity\(\)/ },
  ];

  it("covers the brief's whole list — create, edit, upload, replace, remove, delete", () => {
    // Replace is not a separate action: the database allows only one logo and
    // one signature, so an upload of either IS the replace.
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    for (const { fn } of MUTATIONS) expect(exported, fn).toContain(fn);
  });

  it("each mutation authorizes itself", () => {
    for (const { fn, guard } of MUTATIONS) {
      const start = actions.indexOf(`export async function ${fn}`);
      expect(start, fn).toBeGreaterThan(-1);
      const body = actions.slice(start, start + 700);
      expect(body, `${fn} must guard with ${guard}`).toMatch(guard);
    }
  });

  it("every exported action begins from requireAdmin or a guard that does", () => {
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    for (const fn of exported) {
      const start = actions.indexOf(`export async function ${fn}`);
      const next = actions.indexOf("export async function", start + 1);
      const body = actions.slice(start, next === -1 ? actions.length : next);
      expect(body, `${fn} must authorize`).toMatch(
        /requireAdmin\(\)|requireEntityEdit\(\)|requireFileManage\(\)/,
      );
    }
  });

  it("every write is rate-limited", () => {
    for (const { fn } of MUTATIONS) {
      const start = actions.indexOf(`export async function ${fn}`);
      const next = actions.indexOf("export async function", start + 1);
      const body = actions.slice(start, next === -1 ? actions.length : next);
      expect(body, fn).toMatch(/rateLimitOrError\(me\.id, "write"\)/);
    }
  });

  it("the guards read the permission matrix, not a list of names", () => {
    expect(actions).toMatch(/requireModuleEdit\("admin\.masters\.billing"\)/);
    // No email literal anywhere in the mutation layer.
    expect(actions).not.toMatch(/@unleashed\.in|@gmail\.com|@altuscorp\.com/);
  });

  it("no client component decides authorization for itself", () => {
    for (const f of [
      "components/admin/billing-master/master-table.tsx",
      "components/admin/billing-master/workspace.tsx",
    ]) {
      const src = codeOf(f);
      expect(src, f).not.toMatch(/@unleashed\.in|isMasterAdmin|isSuperAdmin|isFounderEmail/);
      expect(src, f).not.toMatch(/canDeleteBillingEntity|hasCapability/);
      expect(src, f).not.toMatch(/manan/i);
    }
  });
});

describe("the list's controls follow the server's answer", () => {
  const table = codeOf("components/admin/billing-master/master-table.tsx");

  it("New Entity and the bulk actions appear only with Entity Edit", () => {
    expect(table).toMatch(/access\.entityEdit && \(/);
    expect(table).toMatch(/bulkActions=\{\s*access\.entityEdit/);
  });

  it("multi-select drives a real action rather than selecting into a void", () => {
    // A checkbox column with nothing attached invites a selection and then
    // offers nothing to do with it.
    expect(table).toMatch(/BulkStatusActions/);
    expect(table).toMatch(/Activate/);
    expect(table).toMatch(/Deactivate/);
  });

  it("the bulk change writes through the SAME guarded action as a single edit", () => {
    // One write path per fact: the same validation, permission check, audit row
    // and version-history entry. A bulk endpoint would be a second place for
    // all of those to be got right.
    expect(table).toMatch(/updateBillingEntity\(r\.id, \{ isActive \}\)/);
    expect(table).not.toMatch(/bulkUpdate|bulkDelete|deleteBillingEntity/);
  });

  it("bulk DELETE is not offered", () => {
    // Deleting is one person's authority and needs a per-entity confirmation.
    const bulk = table.slice(table.indexOf("function BulkStatusActions"));
    expect(bulk).not.toMatch(/delete/i);
  });
});

describe("the delete confirmation re-asks the server", () => {
  const ws = codeOf("components/admin/billing-master/workspace.tsx");
  const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");

  it("the impact read returns the permission alongside the consequences", () => {
    expect(actions).toMatch(/mayDelete: await mayDeleteBillingEntity\(\)/);
  });

  it("the impact read is itself gated on Entity View, not merely on being an admin", () => {
    // It discloses the entity's name and how many people are paid through it.
    const start = actions.indexOf("export async function billingEntityDeleteImpact");
    const body = actions.slice(start, actions.indexOf("export async function", start + 1));
    expect(body).toMatch(/canViewModule\("admin\.masters\.billing"\)/);
  });

  it("an unauthorized viewer is told before typing anything", () => {
    expect(ws).toMatch(/impact\.mayDelete \?/);
    expect(ws).toMatch(/not authorized to delete a billing entity/);
  });

  it("the confirm cannot fire without the server's yes", () => {
    expect(ws).toMatch(/impact != null &&\s*impact\.mayDelete &&/);
  });

  it("the confirmation names the entity and every consequence", () => {
    const dialog = ws.slice(ws.indexOf("function DeleteConfirm"));
    expect(dialog).toMatch(/\{impact\.name\}/);
    // The brief's required warnings.
    expect(dialog).toMatch(/permanently\s*\n?\s*removed|permanently removed/);
    expect(dialog).toMatch(/Existing billing records reference this entity/);
    expect(dialog).toMatch(/deleted from storage/);
    // And the one the database applies silently.
    expect(dialog).toMatch(/entity\s*\n?\s*assignment will be cleared|assignment will be cleared/);
  });

  it("it offers deactivating as the reversible alternative", () => {
    const dialog = ws.slice(ws.indexOf("function DeleteConfirm"));
    expect(dialog).toMatch(/Deactivating/);
  });
});

describe("§3 one workspace for viewing and editing", () => {
  const ws = codeOf("components/admin/billing-master/workspace.tsx");

  it("there is no separate view mode or edit mode", () => {
    expect(ws).not.toMatch(/ViewMode|EditMode|mode === "view"|isEditing/);
  });

  it("edit affordances are driven by the server's answer", () => {
    expect(ws).toMatch(/const editable = access\.entityEdit/);
    // Save is rendered only for an editor; the action checks again regardless.
    expect(ws).toMatch(/editable && \(\s*<button[\s\S]{0,200}Save Changes/);
  });

  it("a viewer gets read-only inputs rather than a different component", () => {
    // Same element, so the layout does not shift and the value stays
    // selectable — which is most of what a viewer came to do with a GST number.
    expect(ws).toMatch(/readOnly=\{readOnly\}/);
    expect(ws).toMatch(/aria-readonly=\{readOnly\}/);
  });

  it("ESC and X close it; there is no outside-click close", () => {
    expect(ws).toMatch(/e\.key !== "Escape"/);
    expect(ws).toMatch(/aria-label="Close"/);
    expect(ws).toMatch(/unsaved changes/i);
  });

  it("saving sends only what changed", () => {
    expect(ws).toMatch(/updateBillingEntity\(entityId, draft\)/);
    expect(ws).toMatch(/if \(same\) delete next\[key\]/);
  });
});

describe("files are not shipped to a browser that may not have them", () => {
  const queries = codeOf("lib/queries/billing-entities.ts");
  const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");

  it("the detail read takes includeFiles and gates the QUERY, not the render", () => {
    // A signed URL IS the access. Loading one and hiding it in the UI would
    // hand over the document.
    expect(queries).toMatch(/includeFiles: boolean/);
    expect(queries).toMatch(/const files = includeFiles \? await loadFileViews\(id\) : \[\]/);
  });

  it("the action passes the viewer's real file permission", () => {
    expect(actions).toMatch(/loadBillingEntityDetail\(parsed\.data, access\.fileView\)/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §1 + §6 NO SECOND ENTITY MASTER
   ════════════════════════════════════════════════════════════════════════════ */

describe("Billing Master extends the existing entity table", () => {
  const sqlText = codeOf("db/migrations/0226_billing_master.sql");

  it("adds the billing columns to paying_entities", () => {
    expect(sqlText).toMatch(/ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS gst_no/);
    expect(sqlText).toMatch(/ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS pan_no/);
    expect(sqlText).toMatch(/ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS sac_codes/);
  });

  it("creates NO parallel entity table", () => {
    expect(sqlText).not.toMatch(/CREATE TABLE[^;]*\bbilling_entities\b/i);
    expect(sqlText).not.toMatch(/CREATE TABLE[^;]*\bentities\b/i);
    // The two tables it does create are the file rows and the version history,
    // neither of which is a second copy of an entity.
    const created = [...sqlText.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]!);
    expect(created.sort()).toEqual(["billing_entity_files", "billing_entity_versions"]);
  });

  it("the reads go to paying_entities and nowhere else", () => {
    const queries = codeOf("lib/queries/billing-entities.ts");
    expect(queries).toMatch(/from\(payingEntities\)/);
    expect(queries).not.toMatch(/billingEntitiesTbl|outstandingEntitiesTbl/);
  });

  it("files are stored as objects, not as bytes in a column", () => {
    expect(sqlText).toMatch(/storage_path text NOT NULL/);
    expect(sqlText).not.toMatch(/bytea|base64/i);
    const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");
    expect(actions).toMatch(/putObject\(/);
    expect(actions).toMatch(/DOCUMENTS_BUCKET/);
  });
});

describe("§6 resolving an entity for Billing", () => {
  const queries = codeOf("lib/queries/billing-entities.ts");

  it("resolves by NAME, the key every billing surface actually holds", () => {
    expect(queries).toMatch(/export async function resolveBillingEntityByName/);
  });

  it("returns NULL for an unknown name instead of defaulting to an entity", () => {
    // `getEntity()` in lib/hr/entities.ts resolves anything it does not
    // recognise to Altus Corp. That is fine for a letterhead and dangerous on a
    // tax invoice, where it means printing the wrong legal issuer, GST number
    // and bank account on a document somebody will pay against.
    const start = queries.indexOf("export async function resolveBillingEntityByName");
    const body = queries.slice(start, queries.indexOf("export async function", start + 1));
    expect(body).toMatch(/if \(!wanted\) return null/);
    expect(body).toMatch(/if \(!row\) return null/);
    // No fuzzy fallbacks.
    expect(body).not.toMatch(/includes\(|DEFAULT_ENTITY|altus-corp/);
  });
});

describe("§10 duplicate entities are prevented", () => {
  const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");

  it("create and rename both check case-insensitively", () => {
    expect(actions).toMatch(/lower\(\$\{payingEntities\.name\}\) = lower\(/);
    const create = actions.slice(actions.indexOf("export async function createBillingEntity"));
    expect(create).toMatch(/nameTakenError\(parsed\.data\.name\)/);
    const update = actions.slice(actions.indexOf("export async function updateBillingEntity"));
    expect(update).toMatch(/nameTakenError\(parsed\.data\.name, idRes\.data\)/);
  });

  it("renaming an entity to its OWN name is not a duplicate", () => {
    expect(actions).toMatch(/if \(!found \|\| found\.id === exceptId\) return null/);
  });
});

describe("§7 the version history is written, and is not best-effort", () => {
  const actions = codeOf("app/(admin)/admin/billing-master/actions.ts");

  it("every mutation appends a version", () => {
    for (const fn of [
      "createBillingEntity",
      "updateBillingEntity",
      "uploadBillingEntityFile",
      "removeBillingEntityFile",
      "deleteBillingEntity",
    ]) {
      const start = actions.indexOf(`export async function ${fn}`);
      const next = actions.indexOf("export async function", start + 1);
      const body = actions.slice(start, next === -1 ? actions.length : next);
      expect(body, fn).toMatch(/writeVersion\(/);
    }
  });

  it("a failed version write is REPORTED, unlike the audit row", () => {
    // The audit row is swallow-and-warn: a logging failure must not fail a
    // write that already succeeded. The version row is the only record of what
    // an invoice was issued under, so it is checked.
    expect(actions).toMatch(/const version = await writeVersion\([\s\S]{0,80}\n\s*if \(!version\.ok\) return version;/);
    const auditFn = actions.slice(actions.indexOf("async function audit("), actions.indexOf("async function writeVersion"));
    expect(auditFn).toMatch(/catch/);
    expect(auditFn).toMatch(/console\.warn/);
  });

  it("the version row survives the entity — no foreign key on entity_id", () => {
    const sqlText = codeOf("db/migrations/0226_billing_master.sql");
    const versions = sqlText.slice(sqlText.indexOf("CREATE TABLE IF NOT EXISTS billing_entity_versions"));
    const entityIdLine = versions.split("\n").find((l) => l.includes("entity_id"))!;
    expect(entityIdLine).not.toMatch(/REFERENCES/);
    // The file rows, by contrast, must NOT outlive the entity.
    const files = sqlText.slice(
      sqlText.indexOf("CREATE TABLE IF NOT EXISTS billing_entity_files"),
      sqlText.indexOf("CREATE TABLE IF NOT EXISTS billing_entity_versions"),
    );
    expect(files).toMatch(/entity_id uuid NOT NULL REFERENCES paying_entities\(id\) ON DELETE CASCADE/);
  });
});
