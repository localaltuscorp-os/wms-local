/**
 * Candidate Evaluation Checklist (Pre-Interview → formerly "First Assessment").
 * The single source of truth for the interactive interview checklist: 8
 * categories of criteria, plus a Quick Interview Summary whose status is DERIVED
 * from the detailed criteria (no double entry). Client-safe (no server imports).
 *
 * Persisted state = the set of checked criterion ids, saved on the candidate's
 * record (candidate_intake.evaluation).
 */

export interface EvalCriterion {
  id: string;
  label: string;
}
export interface EvalGroup {
  /** Optional sub-heading, e.g. "Must-Have Skills" under Technical Skills. */
  label?: string;
  criteria: EvalCriterion[];
}
export interface EvalCategory {
  id: string;
  title: string;
  groups: EvalGroup[];
}

export const EVAL_CATEGORIES: EvalCategory[] = [
  {
    id: "culture",
    title: "Culture Fit",
    groups: [
      {
        criteria: [
          { id: "culture-values", label: "Aligns with Altus Corp's values" },
          { id: "culture-attitude", label: "Demonstrates a positive attitude and willingness to learn" },
          { id: "culture-smallfirm", label: "Comfortable working in a small, fast-paced firm" },
          { id: "culture-respect", label: "Demonstrates respect, good manners, and professionalism" },
          { id: "culture-temperament", label: "Shows a stable mindset and good temperament" },
        ],
      },
    ],
  },
  {
    id: "behaviour",
    title: "Behaviour & Professionalism",
    groups: [
      {
        criteria: [
          { id: "behav-manners", label: "Demonstrates good manners and basic etiquette" },
          { id: "behav-polite", label: "Communicates politely and professionally" },
          { id: "behav-responsible", label: "Demonstrates responsible behaviour" },
          { id: "behav-ownership", label: "Shows ownership and accountability" },
          { id: "behav-independent", label: "Works independently with minimal supervision" },
        ],
      },
    ],
  },
  {
    id: "communication",
    title: "Communication Skills",
    groups: [
      {
        criteria: [
          { id: "comm-clear", label: "Communicates clearly and confidently" },
          { id: "comm-english", label: "Has a good command of English, both spoken and written" },
          { id: "comm-clients", label: "Can communicate confidently with clients" },
          { id: "comm-convince", label: "Demonstrates strong convincing and persuasion skills" },
        ],
      },
    ],
  },
  {
    id: "technical",
    title: "Technical Skills",
    groups: [
      {
        label: "Must-Have Skills",
        criteria: [
          { id: "tech-drive", label: "Google Drive proficiency, including Docs, Sheets, Slides, and file management" },
          { id: "tech-excel-basic", label: "Basic Microsoft Excel proficiency" },
          { id: "tech-typing", label: "Good typing speed and accuracy" },
          { id: "tech-presentation", label: "Presentation creation skills" },
        ],
      },
      {
        label: "Good-to-Have Skills",
        criteria: [
          { id: "tech-excel-adv", label: "Advanced Microsoft Excel proficiency" },
          { id: "tech-video", label: "Basic video editing skills" },
        ],
      },
    ],
  },
  {
    id: "workstyle",
    title: "Work Style & Work Ethic",
    groups: [
      {
        criteria: [
          { id: "work-hours", label: "Comfortable with the standard working hours of 10:30 AM to 7:30 PM" },
          { id: "work-flex", label: "Flexible to work until 8:00–8:30 PM up to twice a week during sessions" },
          { id: "work-speed", label: "Demonstrates a high overall work speed" },
          { id: "work-multitask", label: "Capable of handling multiple tasks efficiently" },
        ],
      },
    ],
  },
  {
    id: "policy",
    title: "Policy Acceptance",
    groups: [
      {
        criteria: [
          { id: "policy-sunday", label: "Accepts Sunday as the weekly day off" },
          { id: "policy-pf", label: "Comfortable with the current PF policy" },
          { id: "policy-probation", label: "Understands and accepts the 6-month probation period" },
          { id: "policy-leave", label: "Understands the leave policy: 7 paid leaves after completion of probation" },
          { id: "policy-culture", label: "Accepts the firm's work culture and expectations" },
        ],
      },
    ],
  },
  {
    id: "readiness",
    title: "Role Readiness",
    groups: [
      {
        criteria: [
          { id: "role-clientcalls", label: "Comfortable handling client calls" },
          { id: "role-pressure", label: "Can work effectively under pressure during peak hours" },
          { id: "role-problemsolving", label: "Demonstrates good problem-solving skills" },
          { id: "role-growth", label: "Shows willingness to grow with the firm long-term" },
          { id: "role-stability", label: "Demonstrates stability in previous employment" },
          { id: "role-support", label: "Has adequate personal support for the role's work commitments" },
        ],
      },
    ],
  },
  {
    id: "personality",
    title: "Overall Personality",
    groups: [
      {
        criteria: [
          { id: "pers-appearance", label: "Maintains a presentable and professional appearance" },
          { id: "pers-calm", label: "Demonstrates a calm and composed temperament" },
          { id: "pers-honest", label: "Communicates honestly and straightforwardly" },
          { id: "pers-initiative", label: "Demonstrates high initiative and a proactive approach" },
        ],
      },
    ],
  },
];

/** Every criterion id, flat — used for the completion count + validation. */
export const ALL_CRITERION_IDS: string[] = EVAL_CATEGORIES.flatMap((c) =>
  c.groups.flatMap((g) => g.criteria.map((cr) => cr.id)),
);
export const TOTAL_CRITERIA = ALL_CRITERION_IDS.length;

/**
 * Quick Interview Summary — each item's status is DERIVED from the underlying
 * criteria (no re-entry). A summary item is "met" when ALL of its `deriveFrom`
 * criteria are checked, "partial" when some are, "unmet" when none are.
 */
export interface SummaryItem {
  id: string;
  label: string;
  deriveFrom: string[];
}

export const SUMMARY_ITEMS: SummaryItem[] = [
  { id: "sum-culture", label: "Culture Fit", deriveFrom: ["culture-values", "culture-attitude", "culture-respect"] },
  { id: "sum-manners", label: "Manners & Communication", deriveFrom: ["behav-manners", "behav-polite", "comm-clear"] },
  { id: "sum-english", label: "English Proficiency", deriveFrom: ["comm-english"] },
  { id: "sum-ownership", label: "Ownership & Independence", deriveFrom: ["behav-ownership", "behav-independent"] },
  { id: "sum-timing", label: "Timing Flexibility", deriveFrom: ["work-hours", "work-flex"] },
  { id: "sum-policy", label: "Policy Acceptance", deriveFrom: ["policy-sunday", "policy-pf", "policy-probation", "policy-leave", "policy-culture"] },
  { id: "sum-drive-excel", label: "Google Drive & Excel Proficiency", deriveFrom: ["tech-drive", "tech-excel-basic"] },
  { id: "sum-typing", label: "Typing Speed & Accuracy", deriveFrom: ["tech-typing"] },
  { id: "sum-presentation", label: "Presentation Skills", deriveFrom: ["tech-presentation"] },
  { id: "sum-video", label: "Video Editing Skills – Bonus", deriveFrom: ["tech-video"] },
  { id: "sum-clientcall", label: "Client Call Readiness", deriveFrom: ["role-clientcalls", "comm-clients"] },
  { id: "sum-convince", label: "Convincing Power", deriveFrom: ["comm-convince"] },
  { id: "sum-workspeed", label: "Work Speed", deriveFrom: ["work-speed"] },
  { id: "sum-stability", label: "Employment Stability", deriveFrom: ["role-stability"] },
  { id: "sum-smallfirm", label: "Comfortable Working in a Small Firm", deriveFrom: ["culture-smallfirm"] },
  { id: "sum-temperament", label: "Good Temperament", deriveFrom: ["culture-temperament", "pers-calm"] },
];

export type SummaryStatus = "met" | "partial" | "unmet";

/** Per-criterion ratings: criterionId -> 0..10 in 0.5 steps. Absent key = unrated. */
export type Ratings = Record<string, number>;

export interface Score {
  /** Average rating (0..10) across the RATED criteria in the set. */
  avg: number;
  /** How many of the criteria have a rating. */
  rated: number;
  /** Total criteria in the set. */
  total: number;
}

function scoreOf(ids: string[], ratings: Ratings): Score {
  const rated = ids.filter((id) => id in ratings);
  const sum = rated.reduce((s, id) => s + (ratings[id] ?? 0), 0);
  return { avg: rated.length ? sum / rated.length : 0, rated: rated.length, total: ids.length };
}

export function categoryCriterionIds(cat: EvalCategory): string[] {
  return cat.groups.flatMap((g) => g.criteria.map((c) => c.id));
}
export function categoryScore(cat: EvalCategory, ratings: Ratings): Score {
  return scoreOf(categoryCriterionIds(cat), ratings);
}
export function overallScore(ratings: Ratings): Score {
  return scoreOf(ALL_CRITERION_IDS, ratings);
}
export function summaryScore(item: SummaryItem, ratings: Ratings): Score {
  return scoreOf(item.deriveFrom, ratings);
}

/** Tone for a derived score: green ≥7, amber if rated below that, grey if unrated. */
export function scoreStatus(s: Score): SummaryStatus {
  if (!s.rated) return "unmet";
  return s.avg >= 7 ? "met" : "partial";
}

/** How many criteria carry a rating — for the "X / 39 rated" progress indicator. */
export function ratedCount(ratings: Ratings): number {
  return ALL_CRITERION_IDS.filter((id) => id in ratings).length;
}
