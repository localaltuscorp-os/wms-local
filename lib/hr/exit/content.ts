/**
 * Exit-form content — the exact questions, choice sets, rating aspects and
 * clearance items for Annexure A (Handover & Clearance Checklist) and
 * Annexure B (Director Exit Interview). Kept as data so both the form UI and
 * the read-only review render from one source of truth.
 *
 * Company-specific references are intentionally generic ("the Firm") so the
 * questionnaire can be reused across entities without editing copy.
 *
 * Pure module (no "use client"/"use server") — importable from either side.
 */

// ── Exit Interview Questionnaire (Annexure B) ──

export type ChoiceQuestion = {
  id: string;
  n: number;
  prompt: string;
  choices: string[];
  /** Add a free-text "Comments" box under the choice row. */
  comments?: boolean;
};

export type TextQuestion = { id: string; n: number; prompt: string };

/** Q1, Q6, Q7, Q9 — free-text only. */
export const EXIT_TEXT_QUESTIONS: Record<string, TextQuestion> = {
  q1: { id: "q1", n: 1, prompt: "What is your primary reason for leaving the Firm? (e.g., Better compensation, career growth, relocation, work environment)" },
  q6: { id: "q6", n: 6, prompt: "What did you like most about working at the Firm?" },
  q7: { id: "q7", n: 7, prompt: "If there is one thing you could change about the Firm or your team, what would it be?" },
  q9: { id: "q9", n: 9, prompt: "Any suggestions for the Firm?" },
};

/** Q2–Q5, Q8 — choice questions (some with a Comments box). */
export const EXIT_CHOICE_QUESTIONS: ChoiceQuestion[] = [
  { id: "q2", n: 2, prompt: "Did your role and responsibilities align with your expectations when you joined?", choices: ["Yes completely", "Somewhat", "No"], comments: true },
  { id: "q3", n: 3, prompt: "How would you rate your relationship with your immediate manager?", choices: ["Excellent", "Good", "Average", "Fair", "Poor"], comments: true },
  { id: "q4", n: 4, prompt: "How would you rate your overall experience with the Management team?", choices: ["Excellent", "Good", "Average", "Fair", "Poor"], comments: true },
  { id: "q5", n: 5, prompt: "Do you feel you received adequate training, tools, and support to do your job effectively?", choices: ["Yes", "Somewhat", "No"], comments: true },
  { id: "q8", n: 8, prompt: "Would you recommend the Firm as a good place to work to a friend?", choices: ["Yes", "Somewhat", "No"] },
];

/**
 * Standardized 5-point rating scale (stored 5 → 1). Excellent is the top score
 * so higher numbers always mean a better experience.
 */
export const EXIT_RATING_SCALE: { value: number; label: string }[] = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Very Good" },
  { value: 3, label: "Good" },
  { value: 2, label: "Average" },
  { value: 1, label: "Poor" },
];

/**
 * Q10 — rating matrix aspects on the 5-point scale, in document order.
 *
 * De-duplicated: the aspects "Role & responsibilities matched expectations",
 * "Relationship with immediate manager", "Experience with Management" and
 * "Training, tools & support provided" were removed here because they simply
 * repeated upper-section questions Q2–Q5. Their qualitative signal is now
 * captured once (Q2–Q5) plus the open-ended environment note below.
 */
export const EXIT_RATING_ASPECTS: { id: string; label: string }[] = [
  { id: "work_environment", label: "Work environment & culture" },
  { id: "compensation", label: "Compensation & benefits" },
  { id: "career_growth", label: "Career growth opportunities" },
  { id: "communication", label: "Communication within the organization" },
  { id: "overall", label: "Overall experience at the Firm" },
];

/** Matrix column headers, ascending (index i → score i+1): Poor → Excellent. */
export const EXIT_RATING_LEGEND = ["Poor", "Average", "Good", "Very Good", "Excellent"];

/**
 * Open-ended prompts. `env_culture` replaces the ratings removed during
 * de-duplication with a few words; `infrastructure` is a dedicated new prompt.
 */
export const EXIT_ENV_FEEDBACK = {
  id: "env_culture_feedback",
  n: 11,
  prompt: "Work environment & culture — in your own words",
  label: "Write a few words about the work environment & culture…",
};

export const EXIT_INFRA_FEEDBACK = {
  id: "infrastructure_feedback",
  n: 12,
  prompt: "Infrastructure Feedback",
  label: "Tell us about the office infrastructure — workspace, equipment, tools, connectivity…",
};

// ── Handover & Clearance Checklist (Annexure A) ──

export type ClearanceRow = {
  id: string;
  department: string;
  /** Checkable clearance line items. */
  items: { id: string; label: string }[];
};

export const CLEARANCE_ROWS: ClearanceRow[] = [
  {
    id: "reporting_manager",
    department: "Reporting Manager",
    items: [
      { id: "kt_document", label: "KT document reviewed and approved" },
      { id: "project_files", label: "Project files handed over" },
      { id: "client_intros", label: "Client introductions completed" },
      { id: "manager_approval", label: "Reporting manager approval" },
    ],
  },
  {
    id: "it_department",
    department: "IT Department",
    items: [
      { id: "assets_returned", label: "Laptop, charger, and mobile returned" },
      { id: "access_revoked", label: "Email and login system access revoked" },
    ],
  },
  {
    id: "human_resources",
    department: "Human Resources",
    items: [
      { id: "exit_interview", label: "Exit Interview completed" },
      { id: "address_confirmed", label: "Address confirmed for final documents" },
      { id: "fnf_verified", label: "F&F details verified" },
      { id: "relieving_letter", label: "Experience/Relieving letter process initiated" },
    ],
  },
];

export const HANDOVER_INSTRUCTIONS =
  "This checklist must be fully completed and signed by the respective department heads prior to the employee's final working day. Failure to submit this form will delay the Full and Final (F&F) Settlement.";

/** Handover clearance notes — free-text label for the new Notes field. */
export const HANDOVER_NOTES_LABEL =
  "Notes — pending items, exceptions, or context for the F&F team…";

export const EXIT_CONFIDENTIALITY_NOTE =
  "The feedback provided here will be used solely to improve the Firm's work environment. It will not affect your relieving letter or final settlement.";
