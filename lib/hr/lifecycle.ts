import type { LucideIcon } from "lucide-react";
import {
  UserSearch,
  ContactRound,
  ClipboardList,
  Gauge,
  BarChart3,
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
  Award,
  BadgeCheck,
  Target,
  LogOut,
  MessagesSquare,
  Banknote,
  Users,
  Trophy,
  Cake,
  TrendingUp,
  Rocket,
  Star,
  Milestone,
  UserRoundCheck,
  UserRoundX,
  ShieldCheck,
  GraduationCap,
} from "lucide-react";
import { approvedLetterByKey } from "@/lib/hr/letters/catalog";

/**
 * The HR lifecycle and all console navigation derive from this file. Approved
 * letters use the catalogue metadata (code/name/order); legacy templates remain
 * addressable in the registry for historical records but are not offered here.
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
  /** kind === "doc": the letter route key. */
  typeKey?: string;
  /** Approved catalogue code shown beside this letter in navigation. */
  code?: string;
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

function approvedDoc(slug: string, typeKey: string, Icon: LucideIcon): HrItem {
  const letter = approvedLetterByKey(typeKey);
  if (!letter) throw new Error(`Missing approved HR letter catalogue entry: ${typeKey}`);
  return {
    slug,
    label: letter.title,
    code: letter.code,
    Icon,
    kind: "doc",
    typeKey,
    blurb: letter.blurb,
  };
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
      { slug: "selected-candidates", label: "Selected Candidates", Icon: UserRoundCheck, kind: "link", href: "/hr/selected-candidates", blurb: "Everyone the management assessment selected." },
      { slug: "rejected-candidates", label: "Rejected Candidates", Icon: UserRoundX, kind: "link", href: "/hr/rejected-candidates", blurb: "Everyone who was turned down - their form links are closed." },
    ],
  },
  {
    key: "post-interview",
    slug: "post-interview",
    title: "Post-Interview",
    blurb: "Approved post-interview letters.",
    Icon: ClipboardCheck,
    items: [
      approvedDoc("selection-letter", "selection", FileCheck2),
      approvedDoc("rejection-letter", "rejection", FileX2),
      approvedDoc("assignment-needed", "assignment", FileText),
      approvedDoc("next-round-of-interview", "next-round", Repeat),
      approvedDoc("free-training", "free-training", Award),
    ],
  },
  {
    key: "pre-joining",
    slug: "pre-joining",
    title: "Post-Appointment",
    blurb: "Approved appointment and joining letters.",
    Icon: DoorOpen,
    items: [
      { slug: "candidate-records", label: "Candidate Records", Icon: Users, kind: "link", href: "/hr/candidates", blurb: "Every candidate whose interview form was filled." },
      approvedDoc("employee-compliance-acknowledgment", "declaration", FileSignature),
      approvedDoc("policy-signature", "policy-acknowledgement", ScrollText),
      approvedDoc("undertaking-minor", "minor-internship-undertaking", ShieldCheck),
      approvedDoc("appointment-letter", "appointment", Briefcase),
      approvedDoc("declaration-letter", "declaration-letter", FileText),
      approvedDoc("end-of-probation", "confirmation", BadgeCheck),
      approvedDoc("ctc-breakup-letter", "ctc-breakup", IndianRupee),
      { slug: "employment-form", label: "Onboarding Form", Icon: ClipboardList, kind: "link", href: "/dossier/onboarding", blurb: "The joining data form - the full onboarding intake." },
    ],
  },
  {
    key: "during",
    slug: "during",
    title: "During Employment",
    blurb: "Approved in-employment letters and related records.",
    Icon: Milestone,
    items: [
      { slug: "declaration-status", label: "Declaration Status", Icon: ShieldCheck, kind: "link", href: "/hr/declaration", blurb: "Who has returned a signed declaration, and who has not." },
      { slug: "induction", label: "Induction", Icon: GraduationCap, kind: "link", href: "/hr/induction", blurb: "Confirm the new joiner's details - auto-filled from their onboarding form." },
      approvedDoc("employee-of-the-month", "employee-of-the-month", Trophy),
      approvedDoc("birthday-wishes", "birthday", Cake),
      approvedDoc("work-anniversary", "work-anniversary", Award),
      approvedDoc("resignation-rejection", "resignation-rejection", FileX2),
      approvedDoc("resignation-acceptance", "resignation-acceptance", FileCheck2),
    ],
  },
  {
    key: "appraisal",
    slug: "appraisal",
    title: "Appraisal Letters",
    blurb: "Approved progression and compensation letters.",
    Icon: Target,
    items: [
      { slug: "appraisal", label: "Appraisal", Icon: Target, kind: "link", href: "/appraisal", blurb: "The live rolling scorecard & appraisal outcome." },
      approvedDoc("promotion", "promotion", Rocket),
      approvedDoc("salary-revision", "increment", TrendingUp),
      approvedDoc("appraisal-promotion", "promotion-revised-ctc", IndianRupee),
    ],
  },
  {
    key: "exit",
    slug: "exit",
    title: "Exit",
    blurb: "Approved separation letters.",
    Icon: LogOut,
    items: [
      { slug: "exit-interview", label: "Exit Interview & Handover", Icon: MessagesSquare, kind: "link", href: "/hr/exit/interview", blurb: "The exit interview questionnaire & handover clearance checklist." },
      approvedDoc("ffs", "ffs", Banknote),
      approvedDoc("ffs-acknowledgement", "ffs-acknowledgement", FileSignature),
      approvedDoc("relieving-letter", "relieving", FileText),
      approvedDoc("letter-of-recommendation", "letter-of-recommendation", Star),
      approvedDoc("experience-letter", "experience-letter", Award),
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
 * station page under the stage. */
export function hrItemHref(stageSlug: string, item: HrItem): string {
  if (item.kind === "link" && item.href) return item.href;
  if (item.kind === "doc" && item.typeKey) return `/hr/letters/${item.typeKey}`;
  return `/hr/${stageSlug}/${item.slug}`;
}
