import { z } from "zod";

const uuid = z.string().guid("Must be a UUID");

export const AddSectionSchema = z.object({
  title: z.string().trim().min(1, "Section name is required").max(120),
});

export const RenameSectionSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, "Section name is required").max(120),
});

export const DeleteSectionSchema = z.object({ id: uuid });

export const AddLinkSchema = z.object({
  sectionId: uuid,
  label: z.string().trim().min(1, "Button name is required").max(200),
  url: z.string().trim().min(1, "Link is required").max(2000),
});

export const EditLinkSchema = z.object({
  id: uuid,
  label: z.string().trim().min(1, "Button name is required").max(200),
  url: z.string().trim().min(1, "Link is required").max(2000),
});

export const DeleteLinkSchema = z.object({ id: uuid });

/** Accept bare domains too — prefix https:// when the scheme is missing. */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:|^tel:/i.test(s)) return s;
  return `https://${s}`;
}
