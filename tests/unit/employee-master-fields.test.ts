import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";
import {
  EMPLOYEE_STATUS_TABS,
  matchesStatusTab,
  codeSortValue,
  type EmployeeStatusTab,
} from "@/lib/employees/master-filters";
import { EMPLOYEE_TYPE_OPTIONS, WORKER_TYPE_LABELS, payBasisFor } from "@/lib/attendance/worker-type";

/**
 * EMPLOYEE MASTER — the field merges and the Employee status control.
 *
 * Four overlapping fields became two, two sections became one, and the roster
 * gained a status filter. The tests that matter here are the ones that would
 * catch the merges going wrong in the direction that loses data.
 */

/* ════════════════════════════════════════════════════════════════════════════
   THE EMPLOYEE STATUS CONTROL
   ════════════════════════════════════════════════════════════════════════════ */

/** Every value `statusOf` in lib/employees/master-query.ts can return. */
const ALL_STATUSES = ["active", "probation", "inactive", "offboarded"] as const;

describe("Employee status — All | Current | Probation | Past", () => {
  it("offers exactly those four, in that order", () => {
    expect([...EMPLOYEE_STATUS_TABS]).toEqual(["all", "current", "probation", "past"]);
  });

  it("Current is the employed, past probation", () => {
    expect(matchesStatusTab("active", "current")).toBe(true);
    expect(matchesStatusTab("probation", "current")).toBe(false);
    expect(matchesStatusTab("inactive", "current")).toBe(false);
    expect(matchesStatusTab("offboarded", "current")).toBe(false);
  });

  it("Probation is its own bucket, not folded into Current", () => {
    // Somebody on probation is employed, but they are the group an HR
    // administrator most often wants on its own — the reason the control exists.
    expect(matchesStatusTab("probation", "probation")).toBe(true);
    expect(matchesStatusTab("active", "probation")).toBe(false);
  });

  it("Past covers BOTH ways of no longer being here", () => {
    expect(matchesStatusTab("inactive", "past")).toBe(true);
    expect(matchesStatusTab("offboarded", "past")).toBe(true);
    expect(matchesStatusTab("active", "past")).toBe(false);
    expect(matchesStatusTab("probation", "past")).toBe(false);
  });

  it("All matches everything", () => {
    for (const s of ALL_STATUSES) expect(matchesStatusTab(s, "all")).toBe(true);
  });

  /**
   * ── THE PROPERTY THAT ACTUALLY MATTERS ──────────────────────────────────
   * Current + Probation + Past must EXACTLY partition the roster. A filter set
   * whose parts do not add up to the whole silently hides people, and nobody
   * counts the rows to notice.
   */
  it("Current, Probation and Past partition every status exactly once", () => {
    const buckets: EmployeeStatusTab[] = ["current", "probation", "past"];
    for (const status of ALL_STATUSES) {
      const hits = buckets.filter((b) => matchesStatusTab(status, b));
      expect(hits, `${status} landed in ${hits.length} buckets`).toHaveLength(1);
    }
  });

  it("an unrecognised status falls in NO bucket rather than being mislabelled", () => {
    // If `statusOf` ever gains a fifth value, it must show up as a hole in the
    // counts (All > Current + Probation + Past) rather than being quietly
    // filed under Past. A wrong bucket is worse than a visible discrepancy.
    for (const b of ["current", "probation", "past"] as const) {
      expect(matchesStatusTab("sabbatical", b)).toBe(false);
    }
    expect(matchesStatusTab("sabbatical", "all")).toBe(true);
  });

  it("the tab counts and the row filter use the SAME predicate", () => {
    // Two implementations would let a tab advertise a number it then fails to
    // show. Both the memo and the filter call `matchesStatusTab`.
    const src = codeOf("components/admin/employee-master/master-table.tsx");
    // Exactly two CALL SITES — the counts and the row filter. The definition
    // itself is in lib/employees/master-filters.ts, which is why it is not a
    // third occurrence here.
    const calls = src.match(/matchesStatusTab\(/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(src).toMatch(/out\[tab\] = rows\.filter\(\(r\) => matchesStatusTab\(r\.status, tab\)\)/);
    expect(src).toMatch(/if \(!matchesStatusTab\(r\.status, statusTab\)\) return false/);
    // And the table does not define its own copy.
    expect(src).not.toMatch(/function matchesStatusTab/);
  });

  it("the counts are computed over the whole roster, not the filtered view", () => {
    // Counted over `view`, the numbers would change as you typed in the search
    // box — answering "how many are on probation among the rows showing".
    const src = codeOf("components/admin/employee-master/master-table.tsx");
    const memo = src.slice(src.indexOf("const statusCounts"), src.indexOf("const view"));
    expect(memo).toMatch(/rows\.filter/);
    expect(memo).not.toMatch(/\bview\b/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   EMPLOYEE CODE AS ITS OWN COLUMN
   ════════════════════════════════════════════════════════════════════════════ */

describe("the employee code is its own column", () => {
  it("sorts by prefix then by NUMBER, not as text", () => {
    // The bug this prevents: a plain string sort puts A-1000 between A-100 and
    // A-101, and K-9 after K-101.
    const codes = ["A-101", "A-99", "A-1000", "A-100", "K-9", "K-101"];
    const sorted = [...codes].sort((a, b) => codeSortValue(a).localeCompare(codeSortValue(b)));
    expect(sorted).toEqual(["A-99", "A-100", "A-101", "A-1000", "K-9", "K-101"]);
  });

  it("groups a series together — the prefix leads", () => {
    const sorted = ["U-101", "A-102", "UI-101", "A-101"].sort((a, b) =>
      codeSortValue(a).localeCompare(codeSortValue(b)),
    );
    expect(sorted).toEqual(["A-101", "A-102", "U-101", "UI-101"]);
  });

  it("sorts an unissued code LAST, not first", () => {
    // "Not issued" is not a low number. Sorting it first buries everybody who
    // has a code beneath everybody who does not.
    const sorted = [null, "A-101", null, "U-101"].sort((a, b) =>
      codeSortValue(a).localeCompare(codeSortValue(b)),
    );
    expect(sorted).toEqual(["A-101", "U-101", null, null]);
  });

  it("is a default column, and is not also repeated inside Employee Details", () => {
    const src = codeOf("components/admin/employee-master/master-table.tsx");
    expect(src).toMatch(/key: "employeeCode", label: "Employee Code", default: true/);
    // The old inline copy is gone — two renderings of one value in one row.
    const cell = src.slice(src.indexOf("function EmployeeCell"), src.indexOf("function EmployeeCell") + 1200);
    expect(cell).not.toMatch(/employeeCode/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   THE TWO MERGES — each kept the POPULATED field
   ════════════════════════════════════════════════════════════════════════════ */

describe("Department became Function; the empty Function field went", () => {
  const table = codeOf("components/admin/employee-master/master-table.tsx");
  const ws = codeOf("components/admin/employee-master/workspace.tsx");

  it("the Function column reads the DEPARTMENT record", () => {
    // Department carried 18 values and ~27 memberships; `functions` had none.
    // Keeping the empty one would have discarded every real assignment.
    expect(table).toMatch(/key: "function", label: "Function",[^\n]*r\.departmentName/);
  });

  it("no Department column or filter survives under that name", () => {
    expect(table).not.toMatch(/label: "Department"/);
    expect(table).not.toMatch(/key: "department"/);
  });

  it("the empty functions picker is gone from both surfaces", () => {
    expect(table).not.toMatch(/options\.functions/);
    expect(ws).not.toMatch(/options\.functions/);
  });

  it("the workspace shows ONE field, labelled Function, holding the department", () => {
    expect(ws).toMatch(/<Field label="Function"><Readout>\{r\.departmentName/);
    expect(ws).not.toMatch(/label="Department"/);
  });
});

describe("Employee Type became Shift Type; the empty shift_types picker went", () => {
  const table = codeOf("components/admin/employee-master/master-table.tsx");
  const ws = codeOf("components/admin/employee-master/workspace.tsx");

  it("the Shift Type column reads WORKER TYPE", () => {
    // Worker type was set for all 29 people; `shift_types` for nobody.
    expect(table).toMatch(/key: "shift", label: "Shift Type",[^\n]*workerTypeLabel\(r\.workerType\)/);
  });

  it("no Employee Type column or filter survives under that name", () => {
    expect(table).not.toMatch(/label: "Employee Type"/);
    expect(table).not.toMatch(/key: "employeeType"/);
  });

  it("the empty shiftTypes picker is gone from both surfaces", () => {
    expect(table).not.toMatch(/options\.shiftTypes/);
    expect(ws).not.toMatch(/options\.shiftTypes/);
  });

  it("the field is now EDITABLE, through the existing employee action", () => {
    // It was read-only when it was called Employee Type.
    expect(ws).toMatch(/workerType\?: WorkerType;/);
    expect(ws).toMatch(/set\("workerType", x, asWorkerType\(r\.workerType\)\)/);
  });

  it("the dropdown offers the real labels, not raw enum values", () => {
    expect(table).toMatch(/WORKER_TYPE_LABELS\[w\]/);
    expect(WORKER_TYPE_LABELS.second_half).toBe("Second Half");
    expect(WORKER_TYPE_LABELS.full_time).toBe("Full Time");
  });

  /**
   * ── THE CONSEQUENCE THAT MUST NOT BE HIDDEN ─────────────────────────────
   * `worker_type` is the app's single branch point for PAY BASIS. Renaming it
   * "Shift Type" makes a money-moving field look like a scheduling one, so the
   * workspace prints what it pays right underneath.
   */
  it("the workspace states the pay basis beside the field", () => {
    expect(ws).toMatch(/payBasisFor/);
    expect(ws).toMatch(/Paid a monthly CTC/);
    expect(ws).toMatch(/Paid for hours actually worked/);
    expect(ws).toMatch(/Changes how they are paid/);
  });

  it("the basis shown is derived from the payroll function, not restated", () => {
    // A hardcoded string could describe a basis the payslip does not apply.
    expect(payBasisFor("full_time")).toBe("monthly_ctc");
    expect(payBasisFor("second_half")).toBe("hourly");
    expect(payBasisFor("hybrid")).toBe("hourly");
    expect(payBasisFor("first_half")).toBe("hourly");
  });

  it("every offered option has a label and a known pay basis", () => {
    for (const w of EMPLOYEE_TYPE_OPTIONS) {
      expect(WORKER_TYPE_LABELS[w], w).toBeTruthy();
      expect(["monthly_ctc", "hourly", "fixed_fee"]).toContain(payBasisFor(w));
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   SECTIONS: 7 → 5
   ════════════════════════════════════════════════════════════════════════════ */

describe("the workspace sections were merged, not just renamed", () => {
  const ws = codeOf("components/admin/employee-master/workspace.tsx");
  const labels = [...ws.matchAll(/\{ key: "(\w+)", label: "([^"]+)" \}/g)].map((m) => m[2]!);

  /**
   * Asserted as PROPERTIES, not as an exact list.
   *
   * The first version of this test pinned the array to exactly five entries and
   * went red the moment another change legitimately added a sixth section. What
   * this feature actually promises is that Employment and Family are gone and
   * Contact is renamed — not that nobody may ever add a section again. A test
   * that forbids unrelated work is a test that gets deleted rather than fixed.
   */
  it("keeps the four sections that survived, in order", () => {
    const kept = ["Overview", "Payroll", "Contact Details", "Documents", "Work & Attendance"];
    for (const label of kept) expect(labels, label).toContain(label);
    // Relative order still holds, whatever else has been added around them.
    const positions = kept.map((l) => labels.indexOf(l));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("Contact is renamed to Contact Details", () => {
    expect(labels).toContain("Contact Details");
    expect(labels).not.toContain("Contact");
  });

  it("Employment is gone — it restated Overview", () => {
    expect(ws).not.toMatch(/"employment"/);
    expect(ws).not.toMatch(/label: "Employment"/);
  });

  it("Family is gone as a section and merged into Contact Details", () => {
    expect(ws).not.toMatch(/case "family"/);
    expect(ws).not.toMatch(/label: "Family" \}/);
    // Still rendered, as panes inside Contact Details.
    expect(ws).toMatch(/<FamilyPanes detail=\{detail\} \/>/);
    expect(ws).toMatch(/function FamilyPanes/);
  });

  it("nothing unique to Employment was lost — the task quota moved", () => {
    // It was that section's ONLY field not already on Overview.
    const work = ws.slice(ws.indexOf('case "work"'));
    expect(work).toMatch(/Daily task quota/);
  });

  it("FamilyPanes returns a fragment, so the merged section does not double-gap", () => {
    const fn = ws.slice(ws.indexOf("function FamilyPanes"));
    expect(fn.slice(0, 200)).toMatch(/<>/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   AUTOMATIC CODE ALLOCATION
   ════════════════════════════════════════════════════════════════════════════ */

describe("the code follows the entity — automatically, with one stop", () => {
  const actions = codeOf("app/(admin)/admin/employee-master/actions.ts");
  const ws = codeOf("components/admin/employee-master/workspace.tsx");

  it("issues outright for somebody with NO code", () => {
    const fn = actions.slice(actions.indexOf("export async function syncEmployeeCode"));
    expect(fn).toMatch(/if \(!active\) \{[\s\S]{0,400}issueEmployeeCode\(/);
  });

  it("only PROPOSES a move for somebody who already holds one", () => {
    // Issuing retires the old number permanently, and a retired number is never
    // reissued — so a mis-click on the Entity dropdown must not do it.
    const fn = actions.slice(
      actions.indexOf("export async function syncEmployeeCode"),
      actions.indexOf("export async function applyCodeMove"),
    );
    expect(fn).toMatch(/status: "needs_move"/);
    // The proposal branch performs no write.
    const proposal = fn.slice(fn.indexOf('status: "needs_move"'));
    expect(proposal).not.toMatch(/issueEmployeeCode|db\.update|db\.insert/);
  });

  it("does nothing when the entity carries no letter", () => {
    const fn = actions.slice(actions.indexOf("export async function syncEmployeeCode"));
    expect(fn).toMatch(/status: "no_prefix"/);
    expect(fn).toMatch(/status: "no_entity"/);
  });

  it("leaves an already-correct code alone", () => {
    const fn = actions.slice(actions.indexOf("export async function syncEmployeeCode"));
    expect(fn).toMatch(/held\.prefix === wanted[\s\S]{0,120}status: "unchanged"/);
  });

  it("applyCodeMove re-derives the prefix server-side rather than trusting the browser", () => {
    const fn = actions.slice(
      actions.indexOf("export async function applyCodeMove"),
      actions.indexOf("async function activeCodeFor"),
    );
    expect(fn).toMatch(/suggestPrefixFor\(employeeId\)/);
    // No prefix parameter to spoof.
    expect(fn).toMatch(/applyCodeMove\(employeeId: string\)/);
  });

  it("the workspace asks only when the save touched entity or designation", () => {
    expect(ws).toMatch(/"payingEntityId" in draft \|\| "designationId" in draft/);
  });

  it("the proposal is surfaced as a prompt, not applied on arrival", () => {
    expect(ws).toMatch(/setCodeMove\(sync\.data\)/);
    expect(ws).toMatch(/retired <strong>permanently<\/strong>/);
    expect(ws).toMatch(/Keep \{codeMove\.from\}/);
  });

  it("the UI never mints a code itself — the server decides the number", () => {
    // `nextSeq` is a decision over the whole registry, retired rows included.
    expect(ws).not.toMatch(/nextSeq|FIRST_SEQ|formatEmployeeCode/);
  });
});

describe("the scheme's two hard rules still hold", () => {
  const pure = codeOf("lib/employees/employee-code.ts");
  const registry = codeOf("lib/employees/code-registry.ts");

  it("a number is never reused — nextSeq takes max + 1 and fills no gaps", () => {
    expect(pure).toMatch(/export function nextSeq/);
    const fn = pure.slice(pure.indexOf("export function nextSeq"));
    expect(fn).toMatch(/return max \+ 1/);
    expect(fn).not.toMatch(/gap|findFirstFree|indexOf/i);
  });

  it("confirmation MOVES series rather than renaming a code", () => {
    // UI-101 → the next free U-nnn, with UI-101 retired. A rename would both
    // collide with an existing U-101 and silently free the UI number.
    const fn = registry.slice(registry.indexOf("export async function confirmInternCode"));
    expect(fn).toMatch(/confirmedPrefix\(current\.prefix\)/);
    expect(fn).toMatch(/issueEmployeeCode\(/);
    expect(fn).not.toMatch(/set\(\{ code:/);
  });

  it("allocation reads EVERY seq ever issued, retired included", () => {
    const fn = registry.slice(registry.indexOf("export async function issueEmployeeCode"));
    const read = fn.slice(fn.indexOf("employeeCodeRegistry.seq"), fn.indexOf("nextSeq("));
    // No status filter on the read — a retired row must still count.
    expect(read).not.toMatch(/status/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   THE ENTITY LETTERS
   ════════════════════════════════════════════════════════════════════════════ */

describe("migration 0227 assigns the five letters", () => {
  const sqlText = codeOf("db/migrations/0227_entity_code_prefixes.sql");

  it("maps each letter to exactly one entity", () => {
    for (const [letter, name] of [
      ["A", "Altus Corp"],
      ["U", "Unleashed"],
      ["K", "Khushboo"],
      ["M", "The Gainmakers (MJV HUF)"],
      ["J", "Legacy Creators (JSV HUF)"],
    ] as const) {
      expect(sqlText).toMatch(
        new RegExp(`code_prefix = '${letter}'\\s*\\n?\\s*WHERE name = '${name.replace(/[()]/g, "\\$&")}'`),
      );
    }
  });

  it("leaves the second Khushboo entity without a letter", () => {
    // Two entities carried a Khushboo name; the one with the five employees got
    // K, and a letter the other does not need is one nobody else can have.
    expect(sqlText).not.toMatch(/The Perfect Blend[^\n]*code_prefix = '/);
  });

  it("enforces one letter per entity in the database", () => {
    expect(sqlText).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}upper\(code_prefix\)/);
  });

  it("refuses a two-character prefix — the intern series is derived, not stored", () => {
    expect(sqlText).toMatch(/CHECK \(code_prefix IS NULL OR code_prefix ~ '\^\[A-Za-z\]\$'\)/);
  });

  it("is safe to re-run and cannot overwrite a hand-set letter", () => {
    const updates = sqlText.match(/UPDATE paying_entities SET code_prefix[^;]+;/g) ?? [];
    expect(updates.length).toBe(5);
    for (const u of updates) expect(u).toMatch(/code_prefix IS NULL/);
  });
});
