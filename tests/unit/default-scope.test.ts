import { describe, it, expect } from "vitest";
import { defaultScopeId, opensOnEveryone } from "@/lib/auth/default-scope";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";
import { parseFilters } from "@/lib/filters";
import { parseTaskFilters } from "@/lib/task-filters";

/**
 * WHOSE WORK A SURFACE OPENS ON (account holder, 2026-09-12).
 *
 *   Team member → their own      Admin → their own      Super-admin → everyone
 *
 * The middle one is the change: an admin used to open /tasks on the whole
 * company while opening the WMS dashboard on themselves. Pinned here because
 * the rule is a sentence about ROLES that seven call sites have to agree on,
 * and they previously each wrote it out for themselves — and had drifted.
 */

const SUPER = SUPER_ADMIN_EMAILS[0]!;
const member = { id: "emp-member", email: "priya@altuscorp.com" };
const admin = { id: "emp-admin", email: "rakesh@altuscorp.com" };
const superAdmin = { id: "emp-super", email: SUPER };

describe("who opens on everyone", () => {
  it("is the super-admin, and nobody else", () => {
    expect(opensOnEveryone(superAdmin)).toBe(true);
    expect(opensOnEveryone(member)).toBe(false);
    // THE ROLE CHANGE. `isAdmin` is not consulted at all — the helper takes no
    // such field — so an admin cannot drift back to the company-wide default by
    // someone passing a flag.
    expect(opensOnEveryone(admin)).toBe(false);
  });

  it("matches the super-admin list case-insensitively", () => {
    // `employees.email` is stored lowercase, but a hand-typed DEV_USER_EMAIL or
    // a future sign-in path need not be.
    expect(opensOnEveryone({ email: SUPER.toUpperCase() })).toBe(true);
  });

  it("does not treat a lookalike address as the super-admin", () => {
    expect(opensOnEveryone({ email: `x${SUPER}` })).toBe(false);
    expect(opensOnEveryone({ email: `${SUPER}.evil.com` })).toBe(false);
    expect(opensOnEveryone({ email: "" })).toBe(false);
  });
});

describe("defaultScopeId", () => {
  it("gives everyone but the super-admin their own id", () => {
    expect(defaultScopeId(member)).toBe("emp-member");
    expect(defaultScopeId(admin)).toBe("emp-admin");
  });

  it("gives the super-admin undefined, which both parsers read as everyone", () => {
    expect(defaultScopeId(superAdmin)).toBeUndefined();
  });
});

/* The helper is only half the story — what matters is what the two parsers do
   with its answer, since that is what actually scopes the query. */

describe("the dashboard parser, fed the helper's answer", () => {
  const parse = (me: { id: string; email: string }) =>
    parseFilters({}, { defaultEmployeeId: defaultScopeId(me) });

  it("opens a team member and an admin on themselves", () => {
    for (const who of [member, admin]) {
      const f = parse(who);
      expect(f.assigneeMode, who.id).toBe("default");
      expect(f.employeeIds, who.id).toEqual([who.id]);
    }
  });

  it("opens the super-admin on the whole company", () => {
    const f = parse(superAdmin);
    expect(f.assigneeMode).toBe("all");
    expect(f.employeeIds).toEqual([]);
  });

  it("still lets anyone ask for anything explicitly", () => {
    // The default decides the EMPTY url only. A super-admin narrowing to one
    // person, and a member widening to everyone, both have to survive — the
    // filter bar writes exactly these.
    const narrowed = parseFilters({ emp: "emp-x" }, { defaultEmployeeId: defaultScopeId(superAdmin) });
    expect(narrowed.assigneeMode).toBe("specific");
    expect(narrowed.employeeIds).toEqual(["emp-x"]);

    const widened = parseFilters({ emp: "all" }, { defaultEmployeeId: defaultScopeId(member) });
    expect(widened.assigneeMode).toBe("all");
    expect(widened.employeeIds).toEqual([]);
  });
});

describe("the task-list parser, fed the helper's answer", () => {
  const parse = (me: { id: string; email: string }) =>
    parseTaskFilters({}, false, { defaultDoerId: defaultScopeId(me) });

  it("opens a team member and an admin on their own tasks", () => {
    for (const who of [member, admin]) {
      const f = parse(who);
      expect(f.assigneeMode, who.id).toBe("default");
      expect(f.doerIds, who.id).toEqual([who.id]);
    }
  });

  it("opens the super-admin on every task", () => {
    const f = parse(superAdmin);
    expect(f.assigneeMode).toBe("all");
    expect(f.doerIds).toEqual([]);
  });

  it("agrees with the dashboard for the same person", () => {
    /* The two surfaces are reached from one sidebar and are read as one view of
       the same work. They resolved this independently before and disagreed for
       admins — /tasks showed the company, the dashboard showed you. */
    for (const who of [member, admin, superAdmin]) {
      expect(parse(who).assigneeMode, who.id).toBe(
        parseFilters({}, { defaultEmployeeId: defaultScopeId(who) }).assigneeMode,
      );
    }
  });
});
