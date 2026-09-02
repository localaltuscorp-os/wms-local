/**
 * Return-shape types for the Candidate Evaluation v2 server actions. Kept in a
 * PLAIN module (not the "use server" file, which may only export async functions)
 * so client + server can share them.
 */

import type { EvaluationInstance, EvaluatorRole } from "@/lib/hr/candidate/evaluation-v2";

export interface EvaluationV2Load {
  /** The current role's instance (empty template if none saved yet). */
  instance: EvaluationInstance;
  /** The OTHER role's instance for side-by-side comparison (null if none). */
  other: EvaluationInstance | null;
  otherRole: EvaluatorRole;
  /** designation → resolved weight map (each merged over the default profile). */
  profilesByDesignation: Record<string, Record<string, number>>;
  /** The designation ladder, in order. */
  designations: string[];
  /** Best-guess designation for this candidate (from the MA / applied position), else "default". */
  suggestedDesignation: string;
}

export interface WeightProfileRow {
  designation: string;
  weights: Record<string, number>;
}
