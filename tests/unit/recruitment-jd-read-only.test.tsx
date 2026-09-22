// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// usePathname: the workbench draws the Masters heading, whose tab strip reads it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/operations/masters/recruitment-jd",
}));
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
// jsdom has no scrollIntoView; the open dropdown calls it to keep the highlight visible.
Element.prototype.scrollIntoView = vi.fn();

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
const SEED_2 = RECRUITMENT_JD_SEED[1]!;

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

const ROW_2: RecruitmentJdRow = { ...ROW, slug: SEED_2.slug, title: SEED_2.title, jdId: "jd-2", master: SEED_2.content };

function setup(canEdit: boolean) {
  render(<RecruitmentJdWorkbench rows={[ROW, ROW_2]} sends={[]} missing={false} canEdit={canEdit} />);
}

/** The role list is a dropdown beside the heading (2026-09-18) — open it. */
function openRoles() {
  fireEvent.click(screen.getByRole("button", { name: /change role/i }));
}

afterEach(cleanup);

describe("Recruitment JD — a reader who is not HR", () => {
  it("can read the JD but is offered nothing that would refuse them", () => {
    setup(false);
    // The JD itself is there …
    expect(screen.getAllByText(SEED.title).length).toBeGreaterThan(0);
    expect(screen.getByText(/read-only/i)).toBeTruthy();
    // … and every door that writes is shut, the role dropdown's included.
    openRoles();
    expect(screen.getByRole("listbox", { name: /roles/i })).toBeTruthy();
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
    openRoles();
    expect(screen.getByRole("button", { name: /add role/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save recruiter jd/i })).toBeTruthy();
  });
});

describe("Recruitment JD — the role dropdown beside the heading", () => {
  it("sits in the page heading and switches the JD shown below", () => {
    setup(false);
    expect(screen.getByRole("heading", { level: 1, name: "JD-For Recruitment" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: SEED.title })).toBeTruthy();

    openRoles();
    // Each option's name is the title followed by its status.
    fireEvent.click(screen.getByRole("option", { name: (n) => n.startsWith(SEED_2.title) }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: SEED_2.title })).toBeTruthy();
  });

  it("no longer carries the page's description paragraphs", () => {
    setup(true);
    expect(screen.queryByText(/what recruiters send candidates/i)).toBeNull();
    expect(screen.queryByText(/separate from the internal/i)).toBeNull();
  });
});
