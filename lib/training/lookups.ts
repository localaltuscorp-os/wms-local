/**
 * The CLIENT-SAFE half of the LMS master-data module: the kind vocabulary and
 * the row shape. It carries no `server-only` marker on purpose — the
 * configuration screen is a client component and imports these directly. The
 * database reads live in `lib/queries/training-lookups.ts`, which IS server-only.
 */

export const LOOKUP_KINDS = [
  "training_type",
  "audience_scope",
  "share_slot",
  "self_learning_source",
] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

export const LOOKUP_KIND_LABELS: Record<LookupKind, string> = {
  training_type: "Training types",
  audience_scope: "Audience scopes",
  share_slot: "Share slots",
  self_learning_source: "Self-learning sources",
};

export interface LookupOption {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}
