/**
 * Adaptive feedback questions. The feedback form's labels + question wording
 * change with the selected Type. Editable here (a config map) without a schema
 * change — admin-editable UI can layer on later.
 */
export const FEEDBACK_TYPES = ["consultant", "trainer", "in_call"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface FeedbackTemplate {
  label: string;
  /** Name field label — who is being rated. */
  ratedLabel: string;
  /** The rating prompt — {name} is substituted with the rated person. */
  ratingQuestion: string;
  q1: string;
  q2: string;
}

export const FEEDBACK_TEMPLATES: Record<FeedbackType, FeedbackTemplate> = {
  consultant: {
    label: "Consultant",
    ratedLabel: "Consultant name",
    ratingQuestion: "Please rate {name}'s ability to communicate and resolve your concern.",
    q1: "What did the consultant handle well?",
    q2: "What could the consultant have done better?",
  },
  trainer: {
    label: "Trainer",
    ratedLabel: "Trainer name",
    ratingQuestion: "Please rate {name}'s ability to train and clarify the topic.",
    q1: "What did the trainer explain clearly?",
    q2: "What could the trainer improve?",
  },
  in_call: {
    label: "In-call",
    ratedLabel: "Team member name",
    ratingQuestion: "Please rate {name}'s handling of the call.",
    q1: "What went well on the call?",
    q2: "What could be improved on the call?",
  },
};

export function fillTemplate(t: string, name: string): string {
  return t.replace(/\{name\}/g, name.trim() || "the person");
}
