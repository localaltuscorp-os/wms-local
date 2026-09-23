import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  folderNameFor,
  isSecretColumn,
  safeSheetName,
  uniqueFileName,
} from "@/lib/modules/backup/names";
import { WORKSPACE_IDS } from "@/lib/workspaces";

/**
 * The module-wise export: an Export button per module, and a nightly save to
 * Google Drive at 03:00 IST (asked for 21 Sep).
 *
 * The registry and the run engine are `server-only` and reach the database, so
 * these cover the rules that can be checked without one — the credential
 * deny-list, the naming, and the wiring that a refactor could quietly undo.
 */

describe("columns that must never be exported", () => {
  it("catches every credential column the schema audit found", () => {
    for (const column of [
      "password_enc", // ca_handover_credentials, ops_vendors, hr_assets
      "passwordEnc",
      "google_refresh_token", // employees
      "refresh_token_enc", // both Drive connections
      "sign_token", // agreements
      "token_hash", // candidate links, delegated access, sign-in codes
      "token",
      "public_key", // webauthn
      "client_secret",
    ]) {
      expect(isSecretColumn(column), column).toBe(true);
    }
  });

  it("does not swallow ordinary columns", () => {
    for (const column of [
      "name",
      "email",
      "amount",
      "status",
      "created_at",
      "storage_path",
      "file_name",
      "description",
      "employee_id",
    ]) {
      expect(isSecretColumn(column), column).toBe(false);
    }
  });
});

describe("sheet names", () => {
  it("stays inside Excel's 31-character limit", () => {
    const taken = new Set<string>();
    const name = safeSheetName("Attendance punches for every employee, every day", taken);
    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("drops the characters Excel refuses", () => {
    const name = safeSheetName("Salary: paid / unpaid [2026]?", new Set());
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });

  it("never repeats a name, even after truncation", () => {
    const taken = new Set<string>();
    const long = "Outstanding entries and their follow-ups";
    const first = safeSheetName(long, taken);
    const second = safeSheetName(long, taken);
    expect(second).not.toBe(first);
    expect(second.length).toBeLessThanOrEqual(31);
  });
});

describe("file names in a folder", () => {
  it("keeps the extension when it has to add a number", () => {
    const taken = new Set<string>();
    expect(uniqueFileName("aadhaar.pdf", taken)).toBe("aadhaar.pdf");
    expect(uniqueFileName("aadhaar.pdf", taken)).toBe("aadhaar (2).pdf");
    expect(uniqueFileName("aadhaar.pdf", taken)).toBe("aadhaar (3).pdf");
  });

  it("strips path separators, so a stored path cannot escape the folder", () => {
    expect(uniqueFileName("../../etc/passwd", new Set())).not.toContain("/");
    expect(uniqueFileName("C:\\Windows\\system32", new Set())).not.toContain("\\");
  });
});

describe("the dated folder", () => {
  it("is named for the Indian day, not the UTC one", () => {
    // 03:05 IST on 21 Sep is still 21:35 UTC on 20 Sep. A folder called
    // "2026-09-20" for tonight's save would be read wrong by everyone.
    expect(folderNameFor(new Date("2026-09-20T21:35:00Z"))).toBe("2026-09-21 03-05");
  });

  it("sorts in date order as text", () => {
    const a = folderNameFor(new Date("2026-09-20T21:35:00Z"));
    const b = folderNameFor(new Date("2026-10-01T21:35:00Z"));
    expect([b, a].sort()).toEqual([a, b]);
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("covers every room in the hub", () => {
    const registry = read("lib/modules/backup/registry.ts");
    for (const id of WORKSPACE_IDS) {
      expect(registry, id).toMatch(new RegExp(`(^|\\n)  "?${id}"?:`));
    }
  });

  it("saves at 03:00 IST, on its own schedule", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/module-backup");
    expect(cron).toBeTruthy();
    // 21:35 UTC = 03:05 IST — a few minutes after the HR records save so the
    // two do not fight over the same five minutes.
    expect(cron!.schedule).toBe("35 21 * * *");
  });

  it("refuses the nightly run when CRON_SECRET is unset, rather than running open", () => {
    const route = read("app/api/cron/module-backup/route.ts");
    expect(route).toMatch(/if \(!expected\) return false/);
  });

  it("keeps the export behind its own permission, not module access", () => {
    const route = read("app/api/modules/[moduleId]/export/route.ts");
    expect(route).toMatch(/canExportModule\(me, moduleId\)/);
    expect(route).toMatch(/status: 403/);
  });

  it("uses a different Google account from the per-person HR backup", () => {
    const settings = read("lib/modules/backup/settings.ts");
    expect(settings).toMatch(/MODULE_BACKUP_DRIVE_ACCOUNT/);
    expect(settings).not.toMatch(/HR_RECORDS_DRIVE_ACCOUNT/);
  });

  it("only the scheduled run moves the watermark, never a manual download", () => {
    const run = read("lib/modules/backup/run.ts");
    expect(run).toMatch(/if \(run\.kind !== "manual"\)[\s\S]{0,120}markExported/);
  });
});

describe("the screens", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("puts the Export button in every room, from one place", () => {
    const layout = read("app/(app)/layout.tsx");
    expect(layout).toContain("ModuleExportBar");
    // The modules are resolved on the SERVER for this person — a list decided
    // in the browser would be a permission decided in the browser.
    expect(layout).toContain("exportableModules(me, BACKUP_MODULE_IDS)");
  });

  it("hides the button rather than showing one that fails", () => {
    expect(read("components/modules/module-export-bar.tsx")).toContain("allowed.includes(moduleId)");
    expect(read("components/modules/module-export-slot.tsx")).toContain("canExportModule");
  });

  it("keeps the Module Backups page for managers only", () => {
    const page = read("app/(admin)/admin/module-backups/page.tsx");
    expect(page).toContain("canManageModuleBackups(me)");
    expect(read("lib/modules/backup/access.ts")).toContain("return isSuperAdmin(me.email)");
    // notFound, not a redirect: a "forbidden" screen confirms the page exists.
    expect(page).toContain("notFound()");
  });

  it("checks permission inside every action, not just on the page", () => {
    const actions = read("app/(admin)/admin/module-backups/actions.ts");
    const exported = actions.match(/export async function \w+/g) ?? [];
    expect(exported.length).toBeGreaterThan(5);
    // Every one goes through manager(), which re-reads the signed-in person —
    // a page-level check alone would leave the actions callable on their own.
    const guarded = actions.match(/await manager\(\)/g) ?? [];
    expect(guarded.length).toBe(exported.length);
  });

  it("is reachable from the admin rail", () => {
    expect(read("components/admin/admin-nav-config.ts")).toContain("/admin/module-backups");
  });
});
