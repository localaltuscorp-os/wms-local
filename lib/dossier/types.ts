// Employee Dossier — document taxonomy. Client-safe (no server-only): the pill
// order, labels and grouping all derive from DOC_TYPES so the UI and the
// server agree on one list.

export type DossierDocType =
  | "appointment"
  | "probation_end"
  | "ctc_breakup"
  | "increment"
  | "confidentiality_1"
  | "confidentiality_2"
  | "onboarding"
  | "other";

export interface DocTypeMeta {
  key: DossierDocType;
  /** Full label, e.g. section heading. */
  label: string;
  /** Compact label for chips/filters. */
  short: string;
  /** One-line helper shown in the section + upload dialog. */
  hint: string;
  /** lucide-react icon name, resolved where rendered. */
  icon: string;
  /** True when a person naturally has several (increments, misc) — others are 1. */
  multiple: boolean;
  /** Brand accent (hex) for the section header + chip. */
  accent: string;
}

/** The canonical, ordered document set every employee has a place for. */
export const DOC_TYPES: DocTypeMeta[] = [
  {
    key: "appointment",
    label: "Appointment Letter",
    short: "Appointment",
    hint: "The offer / appointment letter issued on joining.",
    icon: "FileSignature",
    multiple: false,
    accent: "#4f46e5",
  },
  {
    key: "probation_end",
    label: "End of Probation Letter",
    short: "Probation End",
    hint: "Confirmation letter marking the end of probation.",
    icon: "BadgeCheck",
    multiple: false,
    accent: "#0891b2",
  },
  {
    key: "ctc_breakup",
    label: "Salary CTC Breakup",
    short: "CTC Breakup",
    hint: "The cost-to-company salary structure breakup.",
    icon: "IndianRupee",
    multiple: false,
    accent: "#16a34a",
  },
  {
    key: "increment",
    label: "Increment Letters",
    short: "Increments",
    hint: "Salary revision / increment letters over time.",
    icon: "TrendingUp",
    multiple: true,
    accent: "#d97706",
  },
  {
    key: "confidentiality_1",
    label: "Confidentiality Letter I",
    short: "Confidentiality I",
    hint: "First confidentiality / NDA agreement.",
    icon: "ShieldCheck",
    multiple: false,
    accent: "#be123c",
  },
  {
    key: "confidentiality_2",
    label: "Confidentiality Letter II",
    short: "Confidentiality II",
    hint: "Second confidentiality / NDA agreement.",
    icon: "ShieldCheck",
    multiple: false,
    accent: "#9333ea",
  },
  {
    key: "onboarding",
    label: "Onboarding Form",
    short: "Onboarding",
    hint: "Completed onboarding form and its responses.",
    icon: "ClipboardList",
    multiple: true,
    accent: "#0d9488",
  },
  {
    key: "other",
    label: "Other Documents",
    short: "Other",
    hint: "Any other letter or document for this person.",
    icon: "Files",
    multiple: true,
    accent: "#475569",
  },
];

const BY_KEY = new Map<string, DocTypeMeta>(DOC_TYPES.map((d) => [d.key, d]));

export function docTypeMeta(key: string): DocTypeMeta {
  return BY_KEY.get(key) ?? DOC_TYPES[DOC_TYPES.length - 1]!; // fall back to "other"
}

export function isDossierDocType(v: string): v is DossierDocType {
  return BY_KEY.has(v);
}

export const DOC_TYPE_KEYS: DossierDocType[] = DOC_TYPES.map((d) => d.key);
