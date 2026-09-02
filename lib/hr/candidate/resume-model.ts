import { INTAKE_SECTIONS, vkey, ageFromDob } from "./intake-schema";
import { visibleFields } from "@/lib/forms/field-types";

/**
 * Shared "resume" projection of a filled Candidate Interview Form — used by BOTH
 * the Review & Submit preview (client) and the PDF export (server), so the two
 * always match. Client-safe (no server imports).
 */
export type ResumeData = Record<string, string>;
export type ResumeInstances = Record<string, string[]>;

export interface ResumeRow {
  label: string;
  value: string;
}
export interface ResumeGroup {
  title: string;
  /** Flat sections (Personal, Residence, Current Work, Academic, Declaration). */
  rows?: ResumeRow[];
  /** Repeater sections (Education, Previous Work, Family) — one row-set per entry. */
  items?: ResumeRow[][];
}

export interface ResumeHeader {
  name: string;
  position: string;
  department: string;
  dob: string;
  age: string;
  mobile: string;
  email: string;
  location: string;
}

/** Personal-section keys shown in the header/contact block (not repeated below). */
const HEADER_ONLY = new Set(["fullName", "position", "department", "mobile", "email", "location", "dob", "age"]);

function val(data: ResumeData, sectionId: string, key: string): string {
  return (data[vkey(sectionId, key)] ?? "").trim();
}

export function resumeHeader(data: ResumeData): ResumeHeader {
  const dob = val(data, "personal", "dob");
  return {
    name: val(data, "personal", "fullName") || "Unnamed Candidate",
    position: val(data, "personal", "position"),
    department: val(data, "personal", "department"),
    dob,
    age: val(data, "personal", "age") || ageFromDob(dob),
    mobile: val(data, "personal", "mobile"),
    email: val(data, "personal", "email"),
    // Structured address replaced the old single `location` field — compose a
    // concise "City, State" for the header (the full address lines still render
    // in the Personal body group).
    location:
      [val(data, "personal", "city"), val(data, "personal", "state")].filter(Boolean).join(", ") ||
      val(data, "personal", "addressLine1"),
  };
}

export function resumeGroups(data: ResumeData, instances: ResumeInstances): ResumeGroup[] {
  const groups: ResumeGroup[] = [];

  for (const s of INTAKE_SECTIONS) {
    if (s.repeat) {
      const items: ResumeRow[][] = [];
      for (const uid of instances[s.id] ?? []) {
        const rows = s.fields
          .map((f) => ({ label: f.label, value: (data[`${s.id}.${uid}.${f.key}`] ?? "").trim() }))
          .filter((r) => r.value);
        if (rows.length) items.push(rows);
      }
      if (items.length) groups.push({ title: s.title, items });
      continue;
    }

    // Non-repeat (Personal, Academic, Current Work, Declaration) — honour showIf.
    const view: Record<string, string> = {};
    for (const f of s.fields) view[f.key] = val(data, s.id, f.key);
    const rows = visibleFields(s.fields, view)
      .filter((f) => !(s.id === "personal" && HEADER_ONLY.has(f.key)))
      .map((f) => ({ label: f.label, value: val(data, s.id, f.key) }))
      .filter((r) => r.value);
    if (rows.length) {
      groups.push({ title: s.id === "personal" ? "Personal Information" : s.title, rows });
    }
  }

  return groups;
}
