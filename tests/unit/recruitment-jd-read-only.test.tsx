// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// The workbench imports its server actions at module scope, so they come with
// the database and the env into jsdom unless they are stubbed.
vi.mock("@/app/(app)/operations/masters/recruitment-jd/actions", () => ({
  addRecruitmentJdRole: vi.fn(async () => ({ ok: true })),
  logRecruitmentJdWhatsApp: vi.fn(async () => ({ ok: true })),
  resetRecruitmentJd: vi.fn(async () => ({ ok: true })),
  restoreRecruitmentJdMaster: vi.fn(async () => ({ ok: true })),
  saveRecruitmentJd: vi.fn(async () => ({ ok: true })),
  sendRecruitmentJdByEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/toast", () => ({ fireToast: vi.fn() }));

import { RecruitmentJdWorkbench } from "@/components/operations/recruitment-jd/recruitment-jd-workbench";
import { RECRUITMENT_JD_SEED } from "@/lib/operations/recruitment-jd-seed";
import type { RecruitmentJdRow } from "@/lib/queries/recruitment-jd";

/**
 * MOVED TO OPERATIONS → MASTERS (account holder, 2026-09-17).
 *
 * The move widened the audience: the Operations room is open to every employee,
 * where the HR rail it came from was not. So reading is open — a JD we are
 * advertising is not a secret, and the people asked to refer candidates are the
 * people who need to read it — while editing and sending stay HR staff only.
 *
 * `canEdit` is PRESENTATION. Every action re-checks with `requireHrStaff` for
 * itself, so this file is about not offering somebody a button that would
 * refuse them, not about the permission itself.
 */

const SEED = RECRUITMENT_JD_SEED[0]!;

const ROW: RecruitmentJdRow = {
  slug: SEED.slug,
  title: SEED.title,
  isActive: true,
  jdId: "jd-1",
  master: SEED.content,
  recruiter: null,
  masterUpdatedAt: null,
  masterUpdatedBy: null,
  recruiterUpdatedAt: null,
  recruiterUpdatedBy: null,
  hasSeed: true,
};

function setup(canEdit: boolean) {
  render(<RecruitmentJdWorkbench rows={[ROW]} sends={[]} missing={false} canEdit={canEdit} />);
}

afterEach(cleanup);

describe("Recruitment JD — a reader who is not HR", () => {
  it("can read the JD but is offered nothing that would refuse them", () => {
    setup(false);
    // The JD itself is there …
    expect(screen.getAllByText(SEED.title).length).toBeGreaterThan(0);
    expect(screen.getByText(/read-only/i)).toBeTruthy();
    // … and every door that writes is shut.
    expect(screen.queryByRole("button", { name: /add role/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save recruiter jd/i })).toBeNull();
  });

  it("offers no way to send — that is a recruiter's job", () => {
    setup(false);
    expect(screen.queryByRole("button", { name: /open whatsapp/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /send email/i })).toBeNull();
  });
});

describe("Recruitment JD — HR staff", () => {
  it("gets the editor, the role list and the send controls", () => {
    setup(true);
    expect(screen.queryByText(/read-only/i)).toBeNull();
    expect(screen.getByRole("button", { name: /add role/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save recruiter jd/i })).toBeTruthy();
  });
});
