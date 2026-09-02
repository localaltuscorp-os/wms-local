/**
 * CANDIDATE EVALUATION v2 — the declarative instrument definition.
 *
 * The single, PURE, CLIENT-SAFE source of truth for the structured candidate
 * evaluation ("Interview Intelligence Platform"). Fourteen sections (A–N) across
 * three buckets, each with a defined input type. No server imports — the client
 * screens, the scoring core, the composite engine and the server actions all
 * read this. Load-neutral.
 *
 * 2026-08-01 — restructured to the A–N "Candidate Evaluation during Interview"
 * spec: A Eligibility (Yes/No/N-A gate) · B–K weighted 0–10 competency sections
 * (Communication · Professional Presence · Character · Culture · Mindset ·
 * Execution · Get-Things-Done · Technical · Experience · X-Factor) · L a Yes/No
 * "Responsibility to Sell?" gate that skips · M Sales Competency (weighted, only
 * when L = Yes) · N Overall (recommendation + narrative). The prerequisites /
 * sales / overall ids are preserved so the scoring gate + stored blobs stay valid.
 */

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type EvalBucketId = "prerequisites" | "mandatory" | "evaluations";

/** How a section is filled. */
export type EvalInputKind =
  | "passfail" // Pre-Requisites — Yes / No / N-A rows (deal-breakers)
  | "rating" // 0..10 rows (+ Can't Say + notes, optional confidence)
  | "gate" // a multi-value gate that reveals its own ratings (Customer-Facing)
  | "sellgate" // a Yes/No gate whose "No" SKIPS the following Sales section (L → M)
  | "overall"; // Overall — recommendation + manual gut 0..10

export interface EvalItem {
  id: string;
  label: string;
  /** Pre-Requisites only — a "No" here flags the candidate for review. */
  critical?: boolean;
}

/** A sub-group inside a section. */
export interface EvalGroup {
  /** Optional sub-heading. */
  label?: string;
  /** Optional relative weight of this sub-group within its section. */
  weight?: number;
  items: EvalItem[];
}

/** Multi-value gate config (Customer-Facing): the gate answer decides whether
 *  this section's ratings are shown / counted. */
export interface EvalGate {
  /** Stored in instance.gates[sectionId]. */
  label: string;
  options: { value: string; label: string }[];
  /** Gate values that REVEAL + count the section's ratings. */
  revealWhen: string[];
}

export interface EvalSection {
  /** Stable id (also the key ratings/passfail are stored under, per-item). */
  id: string;
  /** The display code (Interview Intelligence uses 1–8; kept as string). */
  code: string;
  title: string;
  bucket: EvalBucketId;
  input: EvalInputKind;
  /** Default macro weight (rating sections only; relative + renormalized). */
  weight?: number;
  /** Optional helper note shown under the heading. */
  note?: string;
  /** Rating sections: also capture an optional 0..10 Confidence per item. */
  hasConfidence?: boolean;
  /** Rating sections (Technical): also capture a "Practical Tested?" Yes/No per item. */
  hasPracticalTested?: boolean;
  /** Customer-Facing: a multi-value gate controlling its own ratings. */
  gate?: EvalGate;
  /** When true the whole section applies only to customer-facing / sales roles. */
  salesOnly?: boolean;
  groups: EvalGroup[];
}

/* ------------------------------------------------------------------ */
/* Buckets                                                              */
/* ------------------------------------------------------------------ */

export const EVAL_BUCKETS: { id: EvalBucketId; title: string; blurb: string }[] = [
  {
    id: "prerequisites",
    title: "Pre-Requisites",
    blurb: "Hygiene / deal-breakers — a critical ‘No’ (without a valid exception) flags the candidate for review.",
  },
  {
    id: "mandatory",
    title: "Mandatory Requirements",
    blurb: "Non-negotiable skills & tools needed to perform the basic function of the role.",
  },
  {
    id: "evaluations",
    title: "Evaluations & Judgments",
    blurb: "Qualitative assessment — rate 0–10 (or ‘Can’t Say’), with notes you can dictate.",
  },
];

/* ------------------------------------------------------------------ */
/* Section / group builders                                            */
/* ------------------------------------------------------------------ */

const g = (items: [string, string][]): EvalGroup => ({ items: items.map(([id, label]) => ({ id, label })) });
const gc = (items: [string, string, boolean?][]): EvalGroup => ({
  items: items.map(([id, label, critical]) => ({ id, label, critical: critical ?? false })),
});
/** Named sub-group with a relative weight (used by graded sub-groups). */
export const gl = (label: string, weight: number, items: [string, string][]): EvalGroup => ({
  label,
  weight,
  items: items.map(([id, label]) => ({ id, label })),
});
/** Named sub-group, flat (no relative weight) — for a heading-only sub-section. */
const gn = (label: string, items: [string, string][]): EvalGroup => ({
  label,
  items: items.map(([id, label]) => ({ id, label })),
});

/* ------------------------------------------------------------------ */
/* The A–N sections                                                    */
/* ------------------------------------------------------------------ */

export const EVAL_SECTIONS: EvalSection[] = [
  /* ── A · Eligibility / Non-Negotiables (Pass / Fail) ────────────── */
  {
    id: "prerequisites",
    code: "A",
    title: "Eligibility / Non-Negotiables",
    bucket: "prerequisites",
    input: "passfail",
    note: "Confirm each with the candidate — Yes / No / N-A. A critical ‘No’ (without a recorded exception) flags them for review. Notes can be dictated.",
    groups: [
      gc([
        ["prq-policy-acceptance", "Company Policy Acceptance", true],
        ["prq-travel", "Travel Comfort", true],
        ["prq-6days", "6 Days Working", true],
        ["prq-timing", "10:30 – 7:30 Timing", true],
        ["prq-late", "Late Sitting", false],
        ["prq-sunday", "Sunday Working (Occasional)", false],
        ["prq-probation", "6 Months Probation", true],
        ["prq-leave", "7 Days Leave", false],
        ["prq-training", "15 Days Training", true],
        ["prq-nowfh", "No WFH", true],
        ["prq-smallfirm", "Small Firm Comfort", false],
        ["prq-salary10", "Salary on 10th", false],
        ["prq-attendance", "Attendance Policy", true],
        ["prq-nonveg", "No Non-Veg", false],
        ["prq-policies-sign", "Policies to Sign", false],
        ["prq-ctc", "CTC Structure (No PF / Insurance)", true],
      ]),
    ],
  },

  /* ── B · Communication (Evaluations) ────────────────────────────── */
  {
    id: "communication",
    code: "B",
    title: "Communication",
    bucket: "evaluations",
    input: "rating",
    weight: 12,
    note: "Rate 0–10 (or ‘Can’t Say’). Notes can be dictated.",
    groups: [
      g([
        ["com-listen", "Ability to Listen"],
        ["com-retain", "Ability to Retain"],
        ["com-articulation", "Articulation"],
        ["com-explain", "Ability to Explain"],
        ["com-verbal-english", "Verbal English"],
        ["com-written-english", "Written English"],
        ["com-reserved-outspoken", "Reserved vs Outspoken (Mindha)"],
        ["com-under-over", "Under vs Over Communication"],
      ]),
    ],
  },

  /* ── C · Professional Presence (Evaluations) ────────────────────── */
  {
    id: "presence",
    code: "C",
    title: "Professional Presence",
    bucket: "evaluations",
    input: "rating",
    weight: 8,
    note: "Rate 0–10 each.",
    groups: [
      g([
        ["prs-grooming", "Grooming"],
        ["prs-hygiene", "Personal Hygiene"],
        ["prs-confidence-speaking", "Confidence while Speaking"],
        ["prs-presence-of-mind", "Lost vs Presence of Mind"],
        ["prs-customer-facing", "Customer Facing Ability"],
      ]),
    ],
  },

  /* ── D · Character Fit (Evaluations) ────────────────────────────── */
  {
    id: "character",
    code: "D",
    title: "Character Fit",
    bucket: "evaluations",
    input: "rating",
    weight: 15,
    note: "Rate 0–10 each.",
    groups: [
      g([
        ["chr-honesty", "Honesty"],
        ["chr-integrity", "Integrity"],
        ["chr-family-values", "Family Values"],
        ["chr-manners", "Manners"],
        ["chr-humility", "Humility"],
        ["chr-positive-attitude", "Positive Attitude"],
        ["chr-loyalty", "Loyalty"],
        ["chr-long-term", "Long-term Player"],
        ["chr-not-opportunistic", "Not Opportunistic"],
        ["chr-selfless", "Self Centered vs Selfless"],
      ]),
    ],
  },

  /* ── E · Culture Fit (Evaluations) ──────────────────────────────── */
  {
    id: "culture",
    code: "E",
    title: "Culture Fit",
    bucket: "evaluations",
    input: "rating",
    weight: 12,
    note: "Rate 0–10 each.",
    groups: [
      g([
        ["cul-customer-centric", "Customer Centric"],
        ["cul-company-centric", "Company Centric"],
        ["cul-team-centric", "Team Centric"],
        ["cul-ownership", "Ownership"],
        ["cul-responsibility", "Responsibility"],
        ["cul-knowledge-sharing", "Knowledge Sharing"],
        ["cul-flexibility", "Stubborn vs Flexibility"],
        ["cul-altus-fit", "Altus Corp Value & Culture Fit"],
      ]),
    ],
  },

  /* ── F · Thinking, Learning Agility & Mindset (Evaluations) ─────── */
  {
    id: "mindset",
    code: "F",
    title: "Thinking, Learning Agility & Mindset",
    bucket: "evaluations",
    input: "rating",
    weight: 12,
    hasConfidence: true,
    note: "Rate 0–10 (or ‘Can’t Say’). Notes can be dictated.",
    groups: [
      g([
        ["mnd-common-sense", "Common Sense"],
        ["mnd-think", "Ability to Think"],
        ["mnd-grasping", "Grasping"],
        ["mnd-presence-of-mind", "Presence of Mind"],
        ["mnd-hunger-to-learn", "Hunger to Learn"],
        ["mnd-growth-mindset", "Growth Mindset"],
        ["mnd-passion", "Passion"],
        ["mnd-sensitive-feedback", "Sensitive to Feedback"],
        ["mnd-maturity", "Maturity"],
        ["mnd-self-confidence", "Self Confidence"],
        ["mnd-self-esteem", "Self Esteem"],
        ["mnd-intuition", "Intuition"],
      ]),
    ],
  },

  /* ── G · Execution Capability (Evaluations) ─────────────────────── */
  {
    id: "execution",
    code: "G",
    title: "Execution Capability",
    bucket: "evaluations",
    input: "rating",
    weight: 15,
    note: "Rate 0–10 each.",
    groups: [
      g([
        ["exe-problem-solving", "Problem Solving"],
        ["exe-solution-orientation", "Solution to Problem or Problem to Solution"],
        ["exe-problem-solving-ability", "Problem Solving Ability"],
        ["exe-out-of-box", "Out of the Box Ideas"],
        ["exe-strategic-thinking", "Strategic Thinking"],
        ["exe-execute", "Ability to Execute"],
        ["exe-common-sense", "Common Sense"],
        ["exe-work-speed", "Work Speed"],
        ["exe-ownership", "Ownership"],
        ["exe-work-independently", "Work Independently"],
        ["exe-initiative", "Takes Initiative"],
        ["exe-temperament", "Temperament"],
        ["exe-under-pressure", "Ability to Work Under Pressure"],
        ["exe-handles-rejection", "Handles Rejection"],
        ["exe-takes-feedback", "Ability to take Feedback"],
      ]),
    ],
  },

  /* ── H · Ability to Get Things Done (Evaluations) ───────────────── */
  {
    id: "getdone",
    code: "H",
    title: "Ability to Get Things Done",
    bucket: "evaluations",
    input: "rating",
    weight: 8,
    note: "Rate 0–10 each.",
    groups: [
      g([
        ["gtd-convince", "Ability to Convince"],
        ["gtd-external", "Get Work Done from External People"],
        ["gtd-peers", "Get Work Done from Peers"],
        ["gtd-managers", "Get Work Done from Managers"],
        ["gtd-subordinates", "Get Work Done from Subordinates"],
        ["gtd-delegate", "Ability to Delegate"],
      ]),
    ],
  },

  /* ── I · Technical Skills (Mandatory) ───────────────────────────── */
  {
    id: "technical",
    code: "I",
    title: "Technical Skills",
    bucket: "mandatory",
    input: "rating",
    weight: 8,
    hasPracticalTested: true,
    note: "Proficiency 0–10 + whether you practically tested it.",
    groups: [
      g([
        ["tech-typing", "Typing Speed"],
        ["tech-gdrive", "Google Drive"],
        ["tech-gsheet", "Google Sheets"],
        ["tech-excel-basic", "Basic Excel"],
        ["tech-excel-adv", "Advanced Excel"],
        ["tech-ppt", "Power Point"],
        ["tech-chatgpt", "Chat GPT"],
        ["tech-claude", "Claude"],
        ["tech-canva", "Canva"],
        ["tech-video", "Video Editing"],
        ["tech-digital-mktg", "Digital Marketing"],
        ["tech-drafting", "Drafting Skills"],
      ]),
    ],
  },

  /* ── J · Experience & Career Fit (Evaluations) ──────────────────── */
  {
    id: "experience",
    code: "J",
    title: "Experience & Career Fit",
    bucket: "evaluations",
    input: "rating",
    weight: 6,
    note: "Rate 0–10 each.",
    groups: [
      g([
        ["exp-relevant", "Relevant Experience"],
        ["exp-stability", "Career Stability"],
        ["exp-long-term-potential", "Long-Term Potential"],
        ["exp-salary-expectations", "Salary Expectations"],
        ["exp-fixed-vs-incentive", "Fixed Salary vs Incentive Preference"],
        ["exp-manager-material", "Manager Material"],
      ]),
    ],
  },

  /* ── K · X-Factor (Evaluations) ─────────────────────────────────── */
  {
    id: "xfactor",
    code: "K",
    title: "X-Factor",
    bucket: "evaluations",
    input: "rating",
    weight: 4,
    note: "The intangible edge — rate 0–10.",
    groups: [
      g([
        ["xf-x-factor", "X-Factor"],
      ]),
    ],
  },

  /* ── L · Responsibility to Sell? (Yes/No gate → skips M) ─────────── */
  {
    id: "sell",
    code: "L",
    title: "Responsibility to Sell?",
    bucket: "evaluations",
    input: "sellgate",
    note: "Does this role carry a sales responsibility? If ‘No’, the Sales Competency section (M) is skipped.",
    gate: {
      label: "Responsibility to Sell?",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      revealWhen: ["yes"],
    },
    groups: [],
  },

  /* ── M · Sales Competency (Evaluations, only when L = Yes) ───────── */
  {
    id: "sales",
    code: "M",
    title: "Sales Competency",
    bucket: "evaluations",
    input: "rating",
    weight: 20,
    salesOnly: true,
    note: "Shown only when ‘Responsibility to Sell?’ is Yes. 0–10 each → Sales Readiness score.",
    groups: [
      gn("Prospecting", [
        ["sl-call", "Willing to Call"],
        ["sl-visit", "Willing to Visit Customers"],
        ["sl-references", "Collect References"],
      ]),
      gn("Communication", [
        ["sl-persuasion", "Persuasion"],
        ["sl-convince", "Ability to Convince"],
        ["sl-collect-money", "Ability to Collect Money"],
        ["sl-customer-explanation", "Customer Explanation"],
        ["sl-presentation", "Presentation"],
        ["sl-demeanour", "Demeanour"],
      ]),
      gn("Closing", [
        ["sl-money-collection", "Money Collection"],
        ["sl-negotiation", "Negotiation"],
        ["sl-influence", "Influence Customer"],
      ]),
      gn("Resilience", [
        ["sl-handles-rejection", "Handles Rejection"],
        ["sl-justify-settle", "Justify vs Settle"],
        ["sl-not-stuck", "Doesn’t Get Stuck in Excuses"],
      ]),
      gn("Sales Thinking", [
        ["sl-creativity", "Sales Creativity"],
        ["sl-closing-instinct", "Closing Instinct"],
      ]),
    ],
  },

  /* ── N · Overall Score ──────────────────────────────────────────── */
  {
    id: "overall",
    code: "N",
    title: "Overall Score",
    bucket: "evaluations",
    input: "overall",
    note: "Composite scores compute automatically. Pick a recommendation — you can override it with a reason.",
    groups: [],
  },
];

/* ------------------------------------------------------------------ */
/* Section lookups + item id helpers                                   */
/* ------------------------------------------------------------------ */

export const SECTION_BY_ID: Record<string, EvalSection> = Object.fromEntries(
  EVAL_SECTIONS.map((s) => [s.id, s]),
);

/** Rating sections that carry a macro weight (base/drivers/technical/customer/other/sales). */
export const RATING_SECTIONS: EvalSection[] = EVAL_SECTIONS.filter(
  (s) => s.input === "rating" || s.input === "gate",
);

/** Every item id inside a section (across its groups). */
export function sectionItemIds(section: EvalSection): string[] {
  return section.groups.flatMap((grp) => grp.items.map((i) => i.id));
}

/** Every rating item id, flat — for progress counts. */
export const ALL_RATING_ITEM_IDS: string[] = RATING_SECTIONS.flatMap(sectionItemIds);

/** Every pre-requisite (pass/fail) item id. */
export const ELIGIBILITY_ITEM_IDS: string[] = sectionItemIds(SECTION_BY_ID.prerequisites!);

/** Critical pre-requisite ids — a "No" on any flags the candidate for review. */
export const CRITICAL_PREREQ_IDS: string[] = (SECTION_BY_ID.prerequisites?.groups ?? [])
  .flatMap((grp) => grp.items)
  .filter((i) => i.critical)
  .map((i) => i.id);

/* ------------------------------------------------------------------ */
/* Designations + default weights                                      */
/* ------------------------------------------------------------------ */

/** The rank ladder for per-designation weight profiles (Intern → Sr VP). */
export const DESIGNATION_LADDER = [
  "Intern",
  "Trainee",
  "Executive",
  "Sr Executive",
  "Assistant Manager",
  "Manager",
  "Sr Manager",
  "AVP",
  "VP",
  "Sr VP",
] as const;
export type Designation = (typeof DESIGNATION_LADDER)[number];

/** Section-id → default macro weight (relative; renormalized at score time). */
export const DEFAULT_SECTION_WEIGHTS: Record<string, number> = Object.fromEntries(
  RATING_SECTIONS.map((s) => [s.id, s.weight ?? 0]),
);

/* ------------------------------------------------------------------ */
/* Recommendation + text boxes                                         */
/* ------------------------------------------------------------------ */

export type RecommendationValue =
  | "strong-hire"
  | "hire"
  | "hire-concerns"
  | "hold"
  | "reject";

export const RECOMMENDATIONS: { value: RecommendationValue; label: string; tone: string }[] = [
  { value: "strong-hire", label: "Strong Hire", tone: "#15803d" },
  { value: "hire", label: "Hire", tone: "#16a34a" },
  { value: "hire-concerns", label: "Hire with Concerns", tone: "#d97706" },
  { value: "hold", label: "Hold", tone: "#64748b" },
  { value: "reject", label: "Reject", tone: "#dc2626" },
];

export const TEXTBOX_FIELDS = [
  { id: "justification", label: "Recommendation Reason" },
  { id: "strengths", label: "Strengths" },
  { id: "riskAreas", label: "Risk Areas" },
  { id: "concerns", label: "Concerns" },
  { id: "lackOfClarity", label: "Lack of Clarity" },
] as const;
export type TextboxId = (typeof TEXTBOX_FIELDS)[number]["id"];

/* ------------------------------------------------------------------ */
/* Evaluator role + the stored instance shape                          */
/* ------------------------------------------------------------------ */

export type EvaluatorRole = "interviewer" | "management";

export type PassFail = "yes" | "no" | "na";

/** A recommendation override event (audit trail). */
export interface OverrideEvent {
  /** The auto-computed recommendation being overridden (may be null). */
  from: RecommendationValue | null;
  /** The interviewer's chosen recommendation. */
  to: RecommendationValue;
  /** Mandatory reason. */
  reason: string;
  /** ISO timestamp. */
  at: string;
  /** Actor employee id (set server-side). */
  by?: string;
}

/** One filled evaluation instance (interviewer OR management). */
export interface EvaluationInstance {
  passfail: Record<string, PassFail>;
  /** item id → 0..10 (0.5 steps). */
  ratings: Record<string, number>;
  /** item id → 0..10 optional confidence (Base Expectations). */
  confidence?: Record<string, number>;
  /** item id → practically tested? (Technical Skills). */
  practicalTested?: Record<string, boolean>;
  /** section id → gate answer (Customer-Facing multi-value gate). */
  gates?: Record<string, string>;
  /** item ids explicitly marked "Can't Say" (excluded from averages). */
  cantSay: string[];
  /** per-item free notes (voice-dictated or typed). */
  notes: Record<string, string>;
  /** section-level notes (e.g. Pre-Requisite exceptions), keyed by section id. */
  sectionNotes: Record<string, string>;
  /** Overall manual gut 0..10. */
  overall: number | null;
  /** The interviewer's final recommendation (may be an override of the auto one). */
  recommendation: RecommendationValue | null;
  /** Set when `recommendation` diverges from the auto-computed one. */
  recommendationOverride?: OverrideEvent | null;
  /** Append-only audit of every override. */
  overrideHistory?: OverrideEvent[];
  /** AI-generated (then editable) insight summary blob. */
  aiInsights?: InterviewAiInsights | null;
  textboxes: Partial<Record<TextboxId, string>>;
  updatedAt?: string;
}

/** AI (or heuristic) interview summary — generated then editable before save. */
export interface InterviewAiInsights {
  summary: string;
  strengths: string[];
  concerns: string[];
  behavioural: string;
  technical: string;
  learningPotential: string;
  leadershipPotential: string;
  cultureMatch: string;
  roleSuitability: string;
  recommendedDepartment: string;
  trainingSuggestions: string[];
  salaryRange: string;
  nextRound: string;
  nextRoundQuestions: string[];
  riskFactors: string[];
  /** Provenance badge. */
  source: "ai" | "heuristic";
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** True once a human edited the generated text. */
  edited?: boolean;
}

export function emptyInstance(): EvaluationInstance {
  return {
    passfail: {},
    ratings: {},
    confidence: {},
    practicalTested: {},
    gates: {},
    cantSay: [],
    notes: {},
    sectionNotes: {},
    overall: null,
    recommendation: null,
    recommendationOverride: null,
    overrideHistory: [],
    aiInsights: null,
    textboxes: {},
  };
}

/** The full v2 blob stored on candidate_intake.evaluation_v2. */
export interface EvaluationV2 {
  interviewer?: EvaluationInstance;
  management?: EvaluationInstance;
}
