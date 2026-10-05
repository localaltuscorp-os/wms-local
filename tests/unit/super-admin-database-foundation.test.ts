import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeOf } from "../fixtures/source-code";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/0264_super_admin_grants.sql"),
  "utf8",
);

describe("database-backed Super Admin foundation", () => {
  it("keeps Super Admin membership in its own tables, not capability_grants", () => {
    expect(migration).toMatch(/create table if not exists super_admin_grants/i);
    expect(migration).toMatch(/create table if not exists super_admin_grant_events/i);
    expect(migration).not.toMatch(/alter table capability_grants/i);
  });

  it("is identity-free and creates no memberships as part of the migration", () => {
    expect(migration).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(migration).not.toMatch(/insert\s+into\s+super_admin_grants/i);
  });

  it("protects present and historical Super Admin records", () => {
    expect(migration).toMatch(/employee_id uuid not null references employees\(id\) on delete restrict/i);
    expect(migration).toMatch(/employee_id uuid references employees\(id\) on delete set null/i);
    expect(migration).toMatch(/action in \('granted', 'revoked', 'backfilled'\)/i);
  });

  it("requires an explicit, dry-run-first backfill command", () => {
    const script = codeOf("scripts/backfill-super-admin-grants.ts");
    expect(script).toContain('apply: { type: "boolean", default: false }');
    expect(script).toContain('if (!values.apply)');
    expect(script).toContain('No database changes were made.');
    expect(script).toContain('SUPER_ADMIN_EMAILS');
  });

  it("does not change the existing synchronous Super Admin guard yet", () => {
    const guard = codeOf("lib/auth/super-admin.ts");
    expect(guard).toMatch(/export function isSuperAdmin/);
    const foundation = codeOf("lib/security/super-admin-grants.ts");
    expect(foundation).toContain('hasDatabaseSuperAdminGrant');
    expect(foundation).toContain('The last database-backed Super Admin cannot be removed.');
  });
});
