import type { LucideIcon } from "lucide-react";
import {
  UserSearch,
  ContactRound,
  ClipboardList,
  Gauge,
  ClipboardCheck,
  FileCheck2,
  FileX2,
  FileText,
  Repeat,
  DoorOpen,
  FileSignature,
  IndianRupee,
  ScrollText,
  Briefcase,
  GraduationCap,
  Award,
  BadgeCheck,
  Target,
  LogOut,
  MessagesSquare,
  Banknote,
  Users,
  Handshake,
  Trophy,
  Cake,
  TrendingUp,
  Rocket,
  Star,
  Milestone,
  UserPlus,
  ShieldCheck,
  BarChart3,
} from "lucide-react";

/**
 * The Altus employee lifecycle — the HR room's five stages and the sidebar
 * surfaces inside each. ONE source of truth: the HR front-door cards, each
 * stage's sub-hub, its sidebar (main-nav HR_SECTION_NAV) and the per-item pages
 * (/hr/<stage>/<item>) are all generated from this.
 *
 * item.kind:
 *   "doc"    — a letter/agreement/certificate → redirects to that letter's own
 *              page /hr/letters/<typeKey> (the key of a registered LetterTemplate).
 *   "screen" — a workflow surface still to be planned → placeholder page.
 *   "link"   — jumps to an existing module route (`href`), no page of its own.
 */
export type HrStageKey =
  | "pre-interview"
  | "post-interview"
  | "pre-joining"
  | "during"
  | "appraisal"
  | "exit";

export type HrItemKind = "doc" | "screen" | "link";

export interface HrItem {
  slug: string;
  label: string;
  Icon: LucideIcon;
  kind: HrItemKind;
  /** kind === "doc": the LetterTemplate key opened at /hr/letters/<typeKey>. */
  typeKey?: string;
  /** kind === "link": the existing route to jump to. */
  href?: string;
  blurb: string;
}

export interface HrStage {
  key: HrStageKey;
  slug: HrStageKey;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  items: HrItem[];
}

export const HR_STAGES: HrStage[] = [
  {
    key: "pre-interview",
    slug: "pre-interview",
    title: "Pre-Interview",
    blurb: "Everything before a candidate walks in - details and assessments.",
    Icon: UserSearch,
    items: [
      { slug: "basic-details", label: "Candidate Interview Form", Icon: ContactRound, kind: "link", href: "/hr/intake", blurb: "Fill the candidate's interview details." },
      { slug: "first-assessment", label: "Candidate Evaluation Checklist", Icon: ClipboardList, kind: "link", href: "/hr/evaluation", blurb: "The interactive interview evaluation checklist." },
      { slug: "management-assessment", label: "Management Assessment", Icon: Gauge, kind: "link", href: "/hr/management-assessment", blurb: "The management-round evaluation - notes, voice notes & attachments." },
      { slug: "hiring-analytics", label: "Hiring Analytics", Icon: BarChart3, kind: "link", href: "/hr/hiring-analytics", blurb: "The executive read-out - pipeline, hire rate, scores & interview trends." },
    ],
  },
  {
    key: "post-interview",
    slug: "post-interview",
    title: "Post-Interview",
    blurb: "After the conversation - the decision and the letter that follows.",
    Icon: ClipboardCheck,
    items: [
      { slug: "candidate-records", label: "Candidate Records", Icon: Users, kind: "link", href: "/hr/candidates", blurb: "Every candidate whose interview form was filled." },
      { slug: "candidate-policies", label: "Send Policies to the Candidate", Icon: ScrollText, kind: "link", href: "/hr/candidates", blurb: "Email an outsider every policy to read and sign - no login needed." },
      { slug: "offer-letter", label: "Selection Letter", Icon: FileCheck2, kind: "doc", typeKey: "selection", blurb: "Extend the role to the selected candidate." },
      { slug: "reject-letter", label: "Rejection Letter", Icon: FileX2, kind: "doc", typeKey: "rejection", blurb: "A considerate decline." },
      { slug: "assignment-letter", label: "Assignment Needed Letter", Icon: FileText, kind: "doc", typeKey: "assignment", blurb: "Send a pre-hire assignment." },
      { slug: "next-round", label: "One More Interview Needed Letter", Icon: Repeat, kind: "doc", typeKey: "next-round", blurb: "Invite the candidate to another round." },
      { slug: "acceptance-letter", label: "Acceptance Letter", Icon: Handshake, kind: "doc", typeKey: "acceptance", blurb: "The candidate's written acceptance of the offer." },
      { slug: "free-training", label: "Free Training Letter", Icon: Award, kind: "doc", typeKey: "free-training", blurb: "Pre-employment training & evaluation letter." },
    ],
  },
  {
    key: "pre-joining",
    slug: "pre-joining",
    title: "Pre-Joining",
    blurb: "Between offer and day one - appointment, CTC, policies and forms.",
    Icon: DoorOpen,
    items: [
      { slug: "appointment-letter", label: "Appointment Letter", Icon: FileSignature, kind: "doc", typeKey: "appointment", blurb: "The formal appointment letter." },
      { slug: "intern-appointment", label: "Intern Appointment Letter", Icon: UserPlus, kind: "doc", typeKey: "intern-appointment", blurb: "The internship offer & appointment letter." },
      { slug: "minor-intern-undertaking", label: "Undertaking - Minor Intern", Icon: ShieldCheck, kind: "doc", typeKey: "minor-internship-undertaking", blurb: "Parental-consent undertaking for a minor intern." },
      { slug: "ctc-breakup", label: "CTC Breakup", Icon: IndianRupee, kind: "link", href: "/hr/ctc", blurb: "Build the structured CTC breakup & compensation letters." },
      { slug: "all-policies-signatory", label: "Policy Signatures", Icon: ScrollText, kind: "link", href: "/hr?policies=1", blurb: "Every firm policy to acknowledge and sign." },
      { slug: "employment-form", label: "Employment Form", Icon: ClipboardList, kind: "link", href: "/dossier/onboarding", blurb: "The joining data form - the full onboarding intake." },
    ],
  },
  {
    key: "during",
    slug: "during",
    title: "During Employment",
    blurb: "The settled employee - induction, recognition and the day-to-day of a tenure.",
    Icon: Milestone,
    items: [
      { slug: "induction", label: "Induction", Icon: GraduationCap, kind: "link", href: "/hr/induction", blurb: "Confirm the new joiner's details - auto-filled from their onboarding form." },
      { slug: "employee-of-the-month", label: "Employee of the Month", Icon: Trophy, kind: "doc", typeKey: "employee-of-the-month", blurb: "Recognise a standout performer." },
      { slug: "birthday-wishes", label: "Birthday Wishes", Icon: Cake, kind: "doc", typeKey: "birthday", blurb: "A warm birthday note from the team." },
      { slug: "resignation-rejection", label: "Resignation Rejection Letter", Icon: FileX2, kind: "doc", typeKey: "resignation-rejection", blurb: "Decline a resignation and retain the employee." },
    ],
  },
  {
    key: "appraisal",
    slug: "appraisal",
    title: "Appraisal",
    blurb: "Reward and progression - the appraisal outcome and every letter that follows it.",
    Icon: Target,
    items: [
      { slug: "appraisal", label: "Appraisal Letter", Icon: Target, kind: "link", href: "/appraisal", blurb: "The live rolling scorecard & appraisal outcome." },
      { slug: "increment", label: "Increment Letter", Icon: TrendingUp, kind: "doc", typeKey: "increment", blurb: "Revise compensation with a salary increment." },
      // Both revised-CTC templates existed in the registry but were reachable
      // from nowhere in the nav until this section gave them a home.
      { slug: "appraisal-revised-ctc", label: "New CTC - Appraisal", Icon: IndianRupee, kind: "doc", typeKey: "appraisal-revised-ctc", blurb: "The revised CTC that follows an appraisal." },
      { slug: "promotion-revised-ctc", label: "New CTC - Promotion", Icon: IndianRupee, kind: "doc", typeKey: "promotion-revised-ctc", blurb: "The revised CTC that follows a promotion." },
      { slug: "end-of-probation", label: "End of Probation", Icon: BadgeCheck, kind: "doc", typeKey: "confirmation", blurb: "Confirm the employee on successful completion of probation." },
      { slug: "promotion", label: "Promotion Letter", Icon: Rocket, kind: "doc", typeKey: "promotion", blurb: "Elevate the employee to a new role." },
    ],
  },
  {
    key: "exit",
    slug: "exit",
    title: "Exit",
    blurb: "A clean separation - interview, settlement and closing documents.",
    Icon: LogOut,
    items: [
      { slug: "exit-interview", label: "Exit Interview & Handover", Icon: MessagesSquare, kind: "link", href: "/hr/exit/interview", blurb: "The exit interview questionnaire & handover clearance checklist." },
      { slug: "full-and-final", label: "Full & Final Settlement", Icon: Banknote, kind: "doc", typeKey: "ffs", blurb: "The full & final settlement letter." },
      { slug: "ffs-acknowledgement", label: "FFS Acknowledgement", Icon: FileSignature, kind: "doc", typeKey: "ffs-acknowledgement", blurb: "The employee's acknowledgement of the settlement." },
      // The Relieving Letter IS the resignation acceptance - it is the written
      // acceptance + Last Working Day confirmation that exit-policy §4.4
      // describes. No separate "Resignation Acceptance" letter exists, by design.
      { slug: "relieving-letter", label: "Relieving Letter", Icon: FileText, kind: "doc", typeKey: "relieving", blurb: "Accept the resignation and relieve the employee on their last day." },
      { slug: "letter-of-recommendation", label: "Letter of Recommendation", Icon: Star, kind: "doc", typeKey: "letter-of-recommendation", blurb: "A strong recommendation for the employee." },
      { slug: "experience-letter", label: "Experience Letter", Icon: Award, kind: "doc", typeKey: "experience-letter", blurb: "Certify the employee's tenure & contribution." },
      // ⚠ Employee Certificate: the artwork/content is coming from Shreya Randhe
      // (already built for the PS App, Consultant module). Until it lands this
      // stays the placeholder screen it has always been - it is NOT authored.
      { slug: "completion-certificate", label: "Employee Certificate", Icon: BadgeCheck, kind: "screen", blurb: "Certificate of completion - awaiting the PS App version." },
    ],
  },
];

const STAGE_BY_KEY = new Map<string, HrStage>(HR_STAGES.map((s) => [s.key, s]));

export function getHrStage(key: string): HrStage | undefined {
  return STAGE_BY_KEY.get(key);
}

export function getHrItem(stageKey: string, itemSlug: string): HrItem | undefined {
  return getHrStage(stageKey)?.items.find((i) => i.slug === itemSlug);
}

/** Where a sidebar/card item points: an external module for links, else its own
 *  station page under the stage. */
export function hrItemHref(stageSlug: string, item: HrItem): string {
  if (item.kind === "link" && item.href) return item.href;
  // Letters open on their OWN page directly — skip the intermediate stage/item
  // redirect (which briefly flashed the rail).
  if (item.kind === "doc" && item.typeKey) return `/hr/letters/${item.typeKey}`;
  return `/hr/${stageSlug}/${item.slug}`;
}
